const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const ConversationMember = require("../src/models/ConversationMember");
const conversationRepo = require("../src/repositories/ConversationRepository");
const conversationService = require("../src/services/ConversationService");

test("conversation membership is visible by default", () => {
  assert.equal(ConversationMember.schema.path("hidden").defaultValue, false);
});

test("deleting a conversation permanently removes it for every participant", async () => {
  const original = conversationRepo.hardDeleteForMember;
  const conversationId = String(new mongoose.Types.ObjectId());
  const userId = String(new mongoose.Types.ObjectId());
  let received;
  const otherUserId = String(new mongoose.Types.ObjectId());
  conversationRepo.hardDeleteForMember = async (...args) => {
    received = args;
    return { participantUserIds: [userId, otherUserId], attachmentKeys: [] };
  };
  try {
    const result = await conversationService.removeForUser(userId, conversationId);
    assert.equal(result.responseCode, 200);
    assert.deepEqual(received, [conversationId, userId]);
    assert.deepEqual(result.notifyUserIds, [userId, otherUserId]);
  } finally {
    conversationRepo.hardDeleteForMember = original;
  }
});

test("deleting an unavailable conversation is rejected", async () => {
  const original = conversationRepo.hardDeleteForMember;
  conversationRepo.hardDeleteForMember = async () => null;
  try {
    const result = await conversationService.removeForUser(
      String(new mongoose.Types.ObjectId()),
      String(new mongoose.Types.ObjectId()),
    );
    assert.equal(result.responseCode, 404);
  } finally {
    conversationRepo.hardDeleteForMember = original;
  }
});
