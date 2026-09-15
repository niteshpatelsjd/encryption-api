const mongoose = require("mongoose");
const { DEFAULT_LIMIT, MAX_LIMIT, MIN_GROUP_MEMBERS, MAX_GROUP_MEMBERS } = require("../constants/ConversationConstants");

function validateCreateConversation(body, authenticatedUserId) {
  const participantUserId = typeof body?.participantUserId === "string"
    ? body.participantUserId.trim()
    : "";

  if (!mongoose.Types.ObjectId.isValid(participantUserId)) {
    return { error: "A valid participantUserId is required" };
  }
  if (String(participantUserId) === String(authenticatedUserId)) {
    return { error: "A direct conversation cannot be created with yourself" };
  }
  return { participantUserId };
}

function parseConversationListQuery(query) {
  let limit = Number.parseInt(query?.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const cursor = typeof query?.cursor === "string" && query.cursor.trim()
    ? query.cursor.trim()
    : null;

  const supportsGroups = query?.supportsGroups === "true" || query?.supportsGroups === "1";
  return { limit, cursor, supportsGroups };
}

function validateCreateGroup(body, authenticatedUserId) {
  const groupName = typeof body?.groupName === "string" ? body.groupName.trim() : "";
  const requestedIds = Array.isArray(body?.participantUserIds) ? body.participantUserIds : [];
  const participantUserIds = [...new Set(requestedIds.map(value => String(value).trim()))]
    .filter(value => value !== String(authenticatedUserId));
  if (!groupName || groupName.length > 100) return { error: "Group name must contain 1 to 100 characters" };
  if (participantUserIds.some(id => !mongoose.Types.ObjectId.isValid(id))) return { error: "All participantUserIds must be valid" };
  const totalMembers = participantUserIds.length + 1;
  if (totalMembers < MIN_GROUP_MEMBERS) return { error: `A group requires at least ${MIN_GROUP_MEMBERS} members including you` };
  if (totalMembers > MAX_GROUP_MEMBERS) return { error: `A group supports at most ${MAX_GROUP_MEMBERS} members` };
  const groupDescription = typeof body?.groupDescription === "string" ? body.groupDescription.trim() : "";
  if (groupDescription.length > 512) return { error: "Group description is too long" };
  return { groupName, groupDescription, participantUserIds };
}

function validateGroupPatch(body) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, "groupName")) {
    const value = typeof body.groupName === "string" ? body.groupName.trim() : "";
    if (!value || value.length > 100) return { error: "Group name must contain 1 to 100 characters" };
    patch.groupName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "groupDescription")) {
    const value = typeof body.groupDescription === "string" ? body.groupDescription.trim() : "";
    if (value.length > 512) return { error: "Group description is too long" };
    patch.groupDescription = value;
  }
  if (!Object.keys(patch).length) return { error: "No supported group fields supplied" };
  return { patch };
}

function validateMemberUserId(body) {
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  return mongoose.Types.ObjectId.isValid(userId) ? { userId } : { error: "A valid userId is required" };
}

module.exports = { validateCreateConversation, parseConversationListQuery, validateCreateGroup, validateGroupPatch, validateMemberUserId };
