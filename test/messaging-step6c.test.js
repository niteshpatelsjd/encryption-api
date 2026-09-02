const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Message = require("../src/models/Message");
const User = require("../src/models/User");
const Device = require("../src/models/Device");
const Conversation = require("../src/models/Conversation");
const ConversationMember = require("../src/models/ConversationMember");
const messageRepo = require("../src/repositories/MessageRepository");
const conversationRepo = require("../src/repositories/ConversationRepository");
const messagingService = require("../src/services/MessagingService");
const { validateMessage } = require("../src/validators/MessageValidator");
const { MAX_CIPHERTEXT_BYTES } = require("../src/constants/MessageConstants");
const SocketEvents = require("../src/constants/SocketEvents");
const { initializeMessaging } = require("../src/socket/MessagingSocket");

function validPayload(overrides = {}) {
  return {
    clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    conversationId: String(new mongoose.Types.ObjectId()),
    messageType: "TEXT",
    encryptionVersion: "SIGNAL_V1",
    envelopes: [{
      recipientUserId: String(new mongoose.Types.ObjectId()),
      recipientDeviceId: "recipient-device",
      ciphertext: "OPAQUE_CIPHERTEXT",
      ciphertextType: "PREKEY"
    }],
    ...overrides
  };
}

test("message schema enforces sender/device/client idempotency", () => {
  const indexes = Message.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    fields.senderUserId === 1 && fields.senderDeviceId === 1 && fields.clientMessageId === 1 && options.unique
  ));
  assert.ok(indexes.some(([fields]) => fields.conversationId === 1 && fields.createdAt === -1));
  assert.ok(indexes.some(([fields, options]) =>
    fields.expiresAt === 1 && options.expireAfterSeconds === 0
  ));
});

test("message validation accepts ciphertext and rejects oversized ciphertext", () => {
  assert.ok(validateMessage(validPayload()).value);
  const result = validateMessage(validPayload({
    envelopes: [{
      recipientUserId: String(new mongoose.Types.ObjectId()),
      recipientDeviceId: "recipient-device",
      ciphertext: "x".repeat(MAX_CIPHERTEXT_BYTES + 1),
      ciphertextType: "SIGNAL"
    }]
  }));
  assert.equal(result.errorCode, "MESSAGE_TOO_LARGE");
});

test("message validation accepts safe encrypted action metadata", () => {
  const targetMessageId = "550e8400-e29b-41d4-a716-446655440001";
  const result = validateMessage(validPayload({
    action: { type: "EDIT", targetMessageId }
  }));
  assert.deepEqual(result.value.action, { type: "EDIT", targetMessageId });
  assert.equal(validateMessage(validPayload({ action: { type: "EDIT", targetMessageId: "not-a-message-id" } })).errorCode, "INVALID_MESSAGE");
  assert.equal(validateMessage(validPayload({ action: { type: "UNKNOWN", targetMessageId } })).errorCode, "INVALID_MESSAGE");
});

test("duplicate client message returns the existing persisted message", async () => {
  const originalFind = Message.findOne;
  const originalCreate = Message.create;
  const existing = { _id: new mongoose.Types.ObjectId(), clientMessageId: "existing" };
  let createCalled = false;
  Message.findOne = async () => existing;
  Message.create = async () => { createCalled = true; };
  try {
    const result = await messageRepo.createIdempotent({
      senderUserId: new mongoose.Types.ObjectId(),
      senderDeviceId: "sender-device",
      clientMessageId: "existing"
    });
    assert.equal(result.created, false);
    assert.equal(result.message, existing);
    assert.equal(createCalled, false);
  } finally {
    Message.findOne = originalFind;
    Message.create = originalCreate;
  }
});

test("authenticated socket identity overrides sender fields in payload", async () => {
  const originals = {
    userExists: User.exists,
    userFindById: User.findById,
    deviceExists: Device.exists,
    deviceFind: Device.find,
    conversationFind: Conversation.findOne,
    memberExists: ConversationMember.exists,
    memberCount: ConversationMember.countDocuments,
    create: messageRepo.createIdempotent,
    update: messageRepo.updateConversationActivity,
    restore: conversationRepo.restoreForUsers
  };
  const senderUserId = new mongoose.Types.ObjectId();
  const payload = validPayload({ senderUserId: String(new mongoose.Types.ObjectId()), senderDeviceId: "forged-device" });
  let persisted;
  User.exists = async () => true;
  User.findById = () => ({ select: () => ({ lean: async () => ({ disappearingMessagesEnabled: false }) }) });
  Device.exists = async () => true;
  Device.find = () => ({ select: () => ({ lean: async () => [{ userId: payload.envelopes[0].recipientUserId, deviceId: "recipient-device" }] }) });
  Conversation.findOne = () => ({ select: () => ({ lean: async () => ({ _id: payload.conversationId }) }) });
  ConversationMember.exists = async () => true;
  ConversationMember.countDocuments = async () => 1;
  messageRepo.createIdempotent = async data => {
    persisted = data;
    return { created: true, message: {
      ...data,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      envelopes: data.envelopes
    } };
  };
  messageRepo.updateConversationActivity = async () => null;
  conversationRepo.restoreForUsers = async () => null;
  try {
    const result = await messagingService.send({ senderUserId, senderDeviceId: "authenticated-device", payload });
    assert.equal(result.success, true);
    assert.equal(String(persisted.senderUserId), String(senderUserId));
    assert.equal(persisted.senderDeviceId, "authenticated-device");
  } finally {
    User.exists = originals.userExists;
    User.findById = originals.userFindById;
    Device.exists = originals.deviceExists;
    Device.find = originals.deviceFind;
    Conversation.findOne = originals.conversationFind;
    ConversationMember.exists = originals.memberExists;
    ConversationMember.countDocuments = originals.memberCount;
    messageRepo.createIdempotent = originals.create;
    messageRepo.updateConversationActivity = originals.update;
    conversationRepo.restoreForUsers = originals.restore;
  }
});

test("MESSAGE_NEW routes only to its exact user/device room and ack omits ciphertext", async () => {
  const originalSend = messagingService.send;
  const handlers = {};
  const emissions = [];
  const socket = {
    data: { userId: "sender-user", deviceId: "sender-device" },
    on: (event, handler) => { handlers[event] = handler; }
  };
  const io = {
    to: room => ({ emit: (event, payload) => emissions.push({ room, event, payload }) })
  };
  messagingService.send = async () => ({
    success: true,
    serverMessageId: "server-message",
    clientMessageId: "client-message",
    createdAt: new Date().toISOString(),
    deliveries: [{
      recipientUserId: "recipient-user",
      recipientDeviceId: "recipient-device",
      payload: { ciphertext: "OPAQUE_CIPHERTEXT" }
    }]
  });
  try {
    initializeMessaging(io, socket);
    let acknowledgement;
    await handlers[SocketEvents.MESSAGE_SEND]({}, value => { acknowledgement = value; });
    assert.equal(emissions.length, 1);
    assert.equal(emissions[0].room, "device:recipient-user:recipient-device");
    assert.equal(emissions[0].event, SocketEvents.MESSAGE_NEW);
    assert.equal(acknowledgement.success, true);
    assert.equal(acknowledgement.deliveries, undefined);
    assert.equal(acknowledgement.ciphertext, undefined);
  } finally {
    messagingService.send = originalSend;
  }
});
