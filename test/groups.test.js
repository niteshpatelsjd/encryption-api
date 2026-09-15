const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const conversationRepo = require("../src/repositories/ConversationRepository");
const conversationService = require("../src/services/ConversationService");
const { parseConversationListQuery, validateCreateGroup } = require("../src/validators/ConversationValidator");

test("conversation listing hides groups unless the client advertises group support", () => {
  assert.equal(parseConversationListQuery({}).supportsGroups, false);
  assert.equal(parseConversationListQuery({ supportsGroups: "true" }).supportsGroups, true);
  assert.equal(parseConversationListQuery({ supportsGroups: "1" }).supportsGroups, true);
});

test("group validation includes the creator and removes duplicate members", () => {
  const creator = String(new mongoose.Types.ObjectId());
  const memberA = String(new mongoose.Types.ObjectId());
  const memberB = String(new mongoose.Types.ObjectId());
  const result = validateCreateGroup({
    groupName: "Project team",
    participantUserIds: [creator, memberA, memberA, memberB]
  }, creator);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.participantUserIds, [memberA, memberB]);
});

test("non-admin cannot update group metadata", async () => {
  const originals = {
    findActiveGroup: conversationRepo.findActiveGroup,
    findActiveMembership: conversationRepo.findActiveMembership
  };
  const groupId = String(new mongoose.Types.ObjectId());
  const userId = String(new mongoose.Types.ObjectId());
  conversationRepo.findActiveGroup = async () => ({ _id: groupId, participantIds: [userId] });
  conversationRepo.findActiveMembership = async () => ({ userId, role: "MEMBER" });
  try {
    const result = await conversationService.updateGroup(userId, groupId, { groupName: "Changed" });
    assert.equal(result.responseCode, 403);
  } finally {
    Object.assign(conversationRepo, originals);
  }
});

test("the final group admin cannot leave while other members remain", async () => {
  const originals = {
    findActiveGroup: conversationRepo.findActiveGroup,
    findActiveMembership: conversationRepo.findActiveMembership,
    countActiveAdmins: conversationRepo.countActiveAdmins
  };
  const groupId = String(new mongoose.Types.ObjectId());
  const adminId = String(new mongoose.Types.ObjectId());
  const memberId = String(new mongoose.Types.ObjectId());
  conversationRepo.findActiveGroup = async () => ({ _id: groupId, participantIds: [adminId, memberId] });
  conversationRepo.findActiveMembership = async () => ({ userId: adminId, role: "ADMIN" });
  conversationRepo.countActiveAdmins = async () => 1;
  try {
    const result = await conversationService.leaveGroup(adminId, groupId);
    assert.equal(result.responseCode, 409);
  } finally {
    Object.assign(conversationRepo, originals);
  }
});
