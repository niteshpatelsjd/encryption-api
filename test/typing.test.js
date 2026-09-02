const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Conversation = require("../src/models/Conversation");
const ConversationMember = require("../src/models/ConversationMember");
const Device = require("../src/models/Device");
const typingService = require("../src/services/TypingService");
const SocketEvents = require("../src/constants/SocketEvents");
const { initializeTyping } = require("../src/socket/TypingSocket");

function fakeSocket() {
  const handlers = {};
  return {
    socket: {
      data: { userId: String(new mongoose.Types.ObjectId()), deviceId: "sender-device" },
      on: (event, handler) => { handlers[event] = handler; }
    },
    handlers
  };
}

test("typing authorization requires active conversation, member, and device and excludes sender", async () => {
  const originals = {
    conversation: Conversation.exists,
    member: ConversationMember.exists,
    find: ConversationMember.find,
    device: Device.exists
  };
  const userId = new mongoose.Types.ObjectId();
  const recipientUserId = new mongoose.Types.ObjectId();
  let memberFilter;
  Conversation.exists = async () => true;
  ConversationMember.exists = async () => true;
  Device.exists = async () => true;
  ConversationMember.find = filter => {
    memberFilter = filter;
    return { select: () => ({ lean: async () => [{ userId: recipientUserId }] }) };
  };
  try {
    const result = await typingService.authorize({
      conversationId: String(new mongoose.Types.ObjectId()),
      userId,
      deviceId: "sender-device"
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.recipientUserIds, [String(recipientUserId)]);
    assert.equal(String(memberFilter.userId.$ne), String(userId));
  } finally {
    Conversation.exists = originals.conversation;
    ConversationMember.exists = originals.member;
    ConversationMember.find = originals.find;
    Device.exists = originals.device;
  }
});

test("typing updates route only to conversation recipients and repeated start is throttled", async () => {
  const original = typingService.authorize;
  const { socket, handlers } = fakeSocket();
  const emitted = [];
  const io = { to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  typingService.authorize = async ({ conversationId }) => ({
    success: true,
    conversationId,
    recipientUserIds: ["recipient-a", "recipient-b"]
  });
  try {
    initializeTyping(io, socket, { expiryMs: 1000, throttleMs: 1000 });
    const conversationId = String(new mongoose.Types.ObjectId());
    let secondAck;
    await handlers[SocketEvents.TYPING_START]({ conversationId }, () => null);
    await handlers[SocketEvents.TYPING_START]({ conversationId }, value => { secondAck = value; });
    assert.equal(emitted.length, 2);
    assert.deepEqual(emitted.map(item => item.room), ["user:recipient-a", "user:recipient-b"]);
    assert.ok(emitted.every(item => item.event === SocketEvents.TYPING_UPDATE && item.payload.isTyping === true));
    assert.equal(secondAck.throttled, true);
    await handlers[SocketEvents.TYPING_STOP]({ conversationId }, () => null);
    assert.equal(emitted.length, 4);
    assert.ok(emitted.slice(2).every(item => item.payload.isTyping === false));
  } finally {
    typingService.authorize = original;
  }
});

test("typing automatically stops after inactivity", async () => {
  const original = typingService.authorize;
  const { socket, handlers } = fakeSocket();
  const emitted = [];
  typingService.authorize = async ({ conversationId }) => ({ success: true, conversationId, recipientUserIds: ["recipient-a"] });
  try {
    initializeTyping({ to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }, socket, {
      expiryMs: 10,
      throttleMs: 100
    });
    await handlers[SocketEvents.TYPING_START]({ conversationId: String(new mongoose.Types.ObjectId()) }, () => null);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(emitted.length, 2);
    assert.equal(emitted[0].payload.isTyping, true);
    assert.equal(emitted[1].payload.isTyping, false);
  } finally {
    typingService.authorize = original;
  }
});

test("unauthorized typing events are acknowledged but never broadcast", async () => {
  const original = typingService.authorize;
  const { socket, handlers } = fakeSocket();
  const emitted = [];
  typingService.authorize = async () => ({ success: false, errorCode: "UNAUTHORIZED_CONVERSATION", message: "Unable to update typing status." });
  try {
    initializeTyping({ to: room => ({ emit: (...args) => emitted.push({ room, args }) }) }, socket);
    let acknowledgement;
    await handlers[SocketEvents.TYPING_START]({ conversationId: String(new mongoose.Types.ObjectId()) }, value => { acknowledgement = value; });
    assert.equal(acknowledgement.success, false);
    assert.equal(emitted.length, 0);
  } finally {
    typingService.authorize = original;
  }
});
