const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Message = require("../src/models/Message");
const Device = require("../src/models/Device");
const ConversationMember = require("../src/models/ConversationMember");
const messageRepo = require("../src/repositories/MessageRepository");
const messagingService = require("../src/services/MessagingService");
const SocketEvents = require("../src/constants/SocketEvents");
const { initializeMessaging } = require("../src/socket/MessagingSocket");
const conversationRepo = require("../src/repositories/ConversationRepository");

test("offline sync query is scoped to the authenticated user/device and SENT status", async () => {
  const original = Message.aggregate;
  let pipeline;
  Message.aggregate = async value => { pipeline = value; return []; };
  const userId = new mongoose.Types.ObjectId();
  try {
    await messageRepo.syncForDevice({ userId, deviceId: "device-a", limit: 25, cursor: null });
    const target = pipeline[0].$match.envelopes.$elemMatch;
    assert.equal(String(target.recipientUserId), String(userId));
    assert.equal(target.recipientDeviceId, "device-a");
    assert.equal(target.status, "SENT");
    assert.deepEqual(pipeline[1].$sort, { createdAt: 1, _id: 1 });
    assert.equal(pipeline[2].$limit, 26);
  } finally {
    Message.aggregate = original;
  }
});

test("conversation history rejects a non-member", async () => {
  const original = ConversationMember.exists;
  ConversationMember.exists = async () => null;
  try {
    const result = await messagingService.history(
      new mongoose.Types.ObjectId(),
      "device-a",
      String(new mongoose.Types.ObjectId()),
      {}
    );
    assert.equal(result.responseCode, 403);
  } finally {
    ConversationMember.exists = original;
  }
});

test("READ atomically implies DELIVERED without replacing an existing deliveredAt", async () => {
  const original = Message.findOneAndUpdate;
  let updatePipeline;
  const deliveredAt = new Date("2026-01-01T00:00:00.000Z");
  Message.findOneAndUpdate = (_filter, update) => {
    updatePipeline = update;
    return { select: async () => ({ envelopes: [{ status: "READ", deliveredAt, readAt: new Date() }] }) };
  };
  try {
    const result = await messageRepo.updateReceipt(
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
      "device-a",
      "READ"
    );
    const merge = updatePipeline[0].$set.envelopes.$map.in.$cond[1].$mergeObjects[1];
    assert.equal(merge.status, "READ");
    assert.deepEqual(merge.deliveredAt.$ifNull[0], "$$envelope.deliveredAt");
    assert.equal(result.updated, true);
  } finally {
    Message.findOneAndUpdate = original;
  }
});

test("repeated DELIVERED receipt is idempotent and sends no duplicate notification", async () => {
  const originals = {
    context: messageRepo.findReceiptContext,
    update: messageRepo.updateReceipt,
    device: Device.exists,
    member: ConversationMember.exists
  };
  const userId = new mongoose.Types.ObjectId();
  const deliveredAt = new Date();
  let updateCalled = false;
  messageRepo.findReceiptContext = async () => ({
    conversationId: new mongoose.Types.ObjectId(),
    senderUserId: new mongoose.Types.ObjectId(),
    envelopes: [{ recipientUserId: userId, recipientDeviceId: "device-a", status: "DELIVERED", deliveredAt }]
  });
  messageRepo.updateReceipt = async () => { updateCalled = true; };
  Device.exists = async () => true;
  ConversationMember.exists = async () => true;
  try {
    const result = await messagingService.receipt({
      userId,
      deviceId: "device-a",
      payload: { serverMessageId: String(new mongoose.Types.ObjectId()) },
      receiptType: "DELIVERED"
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "DELIVERED");
    assert.equal(result.notification, null);
    assert.equal(updateCalled, false);
  } finally {
    messageRepo.findReceiptContext = originals.context;
    messageRepo.updateReceipt = originals.update;
    Device.exists = originals.device;
    ConversationMember.exists = originals.member;
  }
});

test("receipt from the wrong recipient device is rejected", async () => {
  const original = messageRepo.findReceiptContext;
  messageRepo.findReceiptContext = async () => ({
    conversationId: new mongoose.Types.ObjectId(),
    senderUserId: new mongoose.Types.ObjectId(),
    envelopes: [{ recipientUserId: new mongoose.Types.ObjectId(), recipientDeviceId: "another-device", status: "SENT" }]
  });
  try {
    const result = await messagingService.receipt({
      userId: new mongoose.Types.ObjectId(),
      deviceId: "device-a",
      payload: { serverMessageId: String(new mongoose.Types.ObjectId()) },
      receiptType: "READ"
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "UNAUTHORIZED_MESSAGE_ACCESS");
  } finally {
    messageRepo.findReceiptContext = original;
  }
});

test("receipt socket notifies only sender room and strips internal notification from ack", async () => {
  const original = messagingService.receipt;
  const handlers = {};
  const emitted = [];
  const socket = {
    data: { userId: "recipient-user", deviceId: "recipient-device" },
    on: (event, handler) => { handlers[event] = handler; }
  };
  const io = { to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  messagingService.receipt = async () => ({
    success: true,
    serverMessageId: "message-a",
    status: "READ",
    readAt: new Date().toISOString(),
    notification: {
      senderUserId: "sender-user",
      event: SocketEvents.MESSAGE_READ,
      payload: { serverMessageId: "message-a" }
    }
  });
  try {
    initializeMessaging(io, socket);
    let acknowledgement;
    await handlers[SocketEvents.MESSAGE_READ]({ serverMessageId: "message-a" }, value => { acknowledgement = value; });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].room, "user:sender-user");
    assert.equal(emitted[0].event, SocketEvents.MESSAGE_READ);
    assert.equal(acknowledgement.notification, undefined);
  } finally {
    messagingService.receipt = original;
  }
});

test("READ receipt advances the recipient conversation read position", async () => {
  const originals = {
    context: messageRepo.findReceiptContext,
    update: messageRepo.updateReceipt,
    device: Device.exists,
    member: ConversationMember.exists,
    markRead: conversationRepo.markRead
  };
  const userId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  let marked;
  messageRepo.findReceiptContext = async () => ({ _id: messageId, conversationId, senderUserId: new mongoose.Types.ObjectId(), createdAt, envelopes: [{ recipientUserId: userId, recipientDeviceId: "device-a", status: "READ", deliveredAt: createdAt, readAt: createdAt }] });
  Device.exists = async () => true;
  ConversationMember.exists = async () => true;
  conversationRepo.markRead = async value => { marked = value; };
  try {
    const result = await messagingService.receipt({ userId, deviceId: "device-a", payload: { serverMessageId: String(messageId) }, receiptType: "READ" });
    assert.equal(result.success, true);
    assert.equal(String(marked.conversationId), String(conversationId));
    assert.equal(String(marked.messageId), String(messageId));
    assert.equal(marked.readAt, createdAt);
  } finally {
    messageRepo.findReceiptContext = originals.context;
    messageRepo.updateReceipt = originals.update;
    Device.exists = originals.device;
    ConversationMember.exists = originals.member;
    conversationRepo.markRead = originals.markRead;
  }
});
