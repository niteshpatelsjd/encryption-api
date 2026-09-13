const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const CallSession = require("../src/models/CallSession");
const ConversationMember = require("../src/models/ConversationMember");
const User = require("../src/models/User");
const callService = require("../src/services/CallService");

const caller = new mongoose.Types.ObjectId();
const recipient = new mongoose.Types.ObjectId();
const conversation = new mongoose.Types.ObjectId();

test("call start requires both users to belong to the conversation", async t => {
  t.mock.method(ConversationMember, "find", () => ({ select() { return this; }, lean: async () => [{ userId: caller }] }));
  const result = await callService.start(caller, "device-a", {
    conversationId: conversation, recipientUserId: recipient, mode: "audio"
  });
  assert.equal(result.responseCode, 403);
});

test("call response rejects the initiator and unavailable calls", async t => {
  let filter;
  let callCount = 0;
  t.mock.method(CallSession, "findOneAndUpdate", value => {
    callCount += 1;
    if (callCount === 1) {
      filter = value;
      return Promise.resolve(null);
    }
    return { lean: async () => null };
  });
  const result = await callService.respond(recipient, "device-b", new mongoose.Types.ObjectId(), { action: "accept" });
  assert.equal(result.responseCode, 404);
  assert.equal(String(filter.participantUserIds), String(recipient));
  assert.equal(String(filter.initiatorUserId.$ne), String(recipient));
  assert.equal(filter.status, "RINGING");
  assert.ok(filter.expiresAt.$gt instanceof Date);
});

test("ending an unavailable call is idempotent", async t => {
  t.mock.method(CallSession, "findOneAndUpdate", () => ({ lean: async () => null }));
  const callId = String(new mongoose.Types.ObjectId());
  const result = await callService.end(caller, callId);
  assert.equal(result.responseCode, 200);
  assert.equal(result.responseBody.callId, callId);
});

test("duplicate clientCallId returns the existing call without creating another record", async t => {
  const existingId = new mongoose.Types.ObjectId();
  t.mock.method(CallSession, "findOne", () => ({ lean: async () => ({
    _id: existingId,
    conversationId: conversation,
    livekitRoomName: "existing-room",
    mode: "audio",
    status: "RINGING",
    expiresAt: new Date(Date.now() + 30000)
  }) }));
  const result = await callService.start(caller, "device-a", {
    conversationId: conversation,
    recipientUserId: recipient,
    mode: "audio",
    clientCallId: "client-call-123"
  });
  assert.equal(result.responseCode, 200);
  assert.equal(result.responseBody.callId, String(existingId));
});

test("expired call invite is marked expired and rejected", async t => {
  let attempt = 0;
  t.mock.method(CallSession, "findOneAndUpdate", () => {
    attempt += 1;
    if (attempt === 1) return Promise.resolve(null);
    return { lean: async () => ({ _id: new mongoose.Types.ObjectId() }) };
  });
  const result = await callService.respond(recipient, "device-b", new mongoose.Types.ObjectId(), { action: "accept" });
  assert.equal(result.responseCode, 410);
  assert.equal(result.message, "Call invite has expired");
});
