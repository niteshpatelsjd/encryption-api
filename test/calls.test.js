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
  t.mock.method(CallSession, "findOne", async () => null);
  const result = await callService.respond(recipient, "device-b", new mongoose.Types.ObjectId(), { action: "accept" });
  assert.equal(result.responseCode, 404);
});

test("ending an unavailable call is idempotent", async t => {
  t.mock.method(CallSession, "findOneAndUpdate", () => ({ lean: async () => null }));
  const callId = String(new mongoose.Types.ObjectId());
  const result = await callService.end(caller, callId);
  assert.equal(result.responseCode, 200);
  assert.equal(result.responseBody.callId, callId);
});
