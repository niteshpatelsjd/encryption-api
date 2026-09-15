const User = require("../models/User");
const mongoose = require("mongoose");
const conversationRepo = require("../repositories/ConversationRepository");
const buildResponse = require("../utils/response");
const s3Util = require("../utils/s3Util");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const { validateCreateConversation, parseConversationListQuery, validateCreateGroup, validateGroupPatch, validateMemberUserId } = require("../validators/ConversationValidator");
const { TYPE_GROUP, ROLE_ADMIN, ROLE_MEMBER, MAX_GROUP_MEMBERS } = require("../constants/ConversationConstants");

function directConversationKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(":");
}

function encodeCursor(conversation) {
  return Buffer.from(JSON.stringify({
    activityAt: conversation.activityAt.toISOString(),
    id: String(conversation._id)
  })).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const activityAt = new Date(value.activityAt);
    if (!mongoose.Types.ObjectId.isValid(value.id) || Number.isNaN(activityAt.getTime())) return null;
    return { id: value.id, activityAt: activityAt.toISOString() };
  } catch (_error) {
    return null;
  }
}

async function buildParticipantResponse(user) {
  return {
    id: user._id,
    name: user.name || "",
    countryCode: user.countryCode || "",
    mobileNumber: user.mobileNumber || "",
    disappearingMessagesEnabled: user.disappearingMessagesEnabled === true,
    profileUrl: user.profileImageKey
      ? await s3Util.getPreSignedUrl(user.profileImageKey)
      : ""
  };
}

async function buildConversationResponse(conversation, membership = null) {
  const unreadCount = membership ? await Message.countDocuments({
    conversationId: conversation._id,
    senderUserId: { $ne: membership.userId },
    ...(membership.lastReadAt ? { createdAt: { $gt: membership.lastReadAt } } : {}),
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  }) : 0;
  return {
    conversationId: conversation._id,
    type: conversation.type,
    groupName: conversation.groupName || null,
    groupDescription: conversation.groupDescription || null,
    groupAvatarUrl: conversation.groupAvatarKey ? await s3Util.getPreSignedUrl(conversation.groupAvatarKey) : "",
    groupVersion: conversation.groupVersion || null,
    encryptionEpoch: conversation.encryptionEpoch || null,
    currentUserRole: membership?.role || null,
    participants: await Promise.all(
      (conversation.participantIds || []).map(buildParticipantResponse)
    ),
    lastMessageId: conversation.lastMessageId || null,
    lastMessageAt: conversation.lastMessageAt || null,
    archived: membership?.archived || false,
    muted: membership?.muted || false,
    lastReadMessageId: membership?.lastReadMessageId || null,
    lastReadAt: membership?.lastReadAt || null,
    unreadCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

async function createDirect(authenticatedUserId, body) {
  const validation = validateCreateConversation(body, authenticatedUserId);
  if (validation.error) return buildResponse(400, validation.error);

  const participant = await User.findOne({
    _id: validation.participantUserId,
    status: 1
  }).select("_id").lean();
  if (!participant) return buildResponse(404, "Participant user not found or inactive");

  const participantIds = [authenticatedUserId, validation.participantUserId];
  const conversation = await conversationRepo.findOrCreateDirect({
    participantIds,
    directConversationKey: directConversationKey(...participantIds),
    createdBy: authenticatedUserId
  });
  await conversationRepo.restoreForUsers(conversation._id, [authenticatedUserId]);

  logger.info("Direct conversation retrieved", { conversationId: conversation._id });
  return buildResponse(
    200,
    "Conversation retrieved successfully",
    await buildConversationResponse(conversation)
  );
}

async function list(authenticatedUserId, query) {
  const { limit, cursor: encodedCursor, supportsGroups } = parseConversationListQuery(query);
  const cursor = decodeCursor(encodedCursor);
  if (encodedCursor && !cursor) return buildResponse(400, "Invalid conversation cursor");

  const result = await conversationRepo.listForUser({
    userId: authenticatedUserId,
    limit,
    cursor,
    supportsGroups
  });
  const content = await Promise.all(
    result.conversations.map(conversation => buildConversationResponse(
      conversation,
      result.memberships.get(String(conversation._id))
    ))
  );
  const lastConversation = result.conversations[result.conversations.length - 1];

  return buildResponse(200, "Conversations fetched successfully", {
    content,
    limit,
    nextCursor: result.hasMore && lastConversation
      ? encodeCursor(lastConversation)
      : null,
    hasMore: result.hasMore
  });
}

async function removeForUser(authenticatedUserId, conversationId) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return buildResponse(400, "Invalid conversationId");
  const deleted = await conversationRepo.hardDeleteForMember(conversationId, authenticatedUserId);
  if (!deleted) return buildResponse(404, "Conversation not found");

  const objectDeletionResults = await Promise.allSettled(
    deleted.attachmentKeys.map(key => s3Util.deleteFile(key))
  );
  const failedObjectDeletes = objectDeletionResults.filter(result => result.status === "rejected").length;
  if (failedObjectDeletes) {
    logger.error("Conversation attachment cleanup incomplete", { conversationId, failedObjectDeletes });
  }

  logger.info("Conversation permanently deleted", {
    conversationId,
    deletedByUserId: authenticatedUserId,
    participantUserIds: deleted.participantUserIds
  });
  const response = buildResponse(200, "Conversation permanently deleted for all participants", null);
  response.notifyUserIds = deleted.participantUserIds;
  return response;
}

async function requireGroupMember(conversationId, userId, requireAdmin = false) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return { response: buildResponse(400, "Invalid conversationId") };
  const [group, membership] = await Promise.all([
    conversationRepo.findActiveGroup(conversationId),
    conversationRepo.findActiveMembership(conversationId, userId)
  ]);
  if (!group || !membership) return { response: buildResponse(404, "Group not found") };
  if (requireAdmin && membership.role !== ROLE_ADMIN) return { response: buildResponse(403, "Only a group admin can perform this action") };
  return { group, membership };
}

async function createGroup(authenticatedUserId, body) {
  const validation = validateCreateGroup(body, authenticatedUserId);
  if (validation.error) return buildResponse(400, validation.error);
  const requestedIds = validation.participantUserIds;
  const users = await User.find({ _id: { $in: requestedIds }, status: 1 }).select("_id").lean();
  if (users.length !== requestedIds.length) return buildResponse(404, "One or more participants were not found or are inactive");
  const participantIds = [authenticatedUserId, ...requestedIds];
  const group = await conversationRepo.createGroup({
    participantIds,
    createdBy: authenticatedUserId,
    groupName: validation.groupName,
    groupDescription: validation.groupDescription
  });
  const membership = await conversationRepo.findActiveMembership(group._id, authenticatedUserId);
  const response = buildResponse(201, "Group created successfully", await buildConversationResponse(group, membership));
  response.notifyUserIds = participantIds.map(String);
  return response;
}

async function getGroup(authenticatedUserId, conversationId) {
  const context = await requireGroupMember(conversationId, authenticatedUserId);
  if (context.response) return context.response;
  const memberships = await conversationRepo.listActiveMemberships(conversationId);
  const data = await buildConversationResponse(context.group, context.membership);
  const roleByUserId = new Map(memberships.map(item => [String(item.userId), item]));
  data.participants = data.participants.map(participant => ({
    ...participant,
    role: roleByUserId.get(String(participant.id))?.role || ROLE_MEMBER,
    joinedAt: roleByUserId.get(String(participant.id))?.joinedAt || null
  }));
  return buildResponse(200, "Group fetched successfully", data);
}

async function updateGroup(authenticatedUserId, conversationId, body) {
  const context = await requireGroupMember(conversationId, authenticatedUserId, true);
  if (context.response) return context.response;
  const validation = validateGroupPatch(body);
  if (validation.error) return buildResponse(400, validation.error);
  const group = await conversationRepo.updateGroup(conversationId, validation.patch);
  const response = buildResponse(200, "Group updated successfully", await buildConversationResponse(group, context.membership));
  response.notifyUserIds = group.participantIds.map(user => String(user._id || user));
  return response;
}

async function addGroupMember(authenticatedUserId, conversationId, body) {
  const context = await requireGroupMember(conversationId, authenticatedUserId, true);
  if (context.response) return context.response;
  const validation = validateMemberUserId(body);
  if (validation.error) return buildResponse(400, validation.error);
  if (context.group.participantIds.length >= MAX_GROUP_MEMBERS) return buildResponse(409, "The group member limit has been reached");
  if (context.group.participantIds.some(user => String(user._id || user) === validation.userId)) return buildResponse(409, "User is already a group member");
  const user = await User.findOne({ _id: validation.userId, status: 1 }).select("_id").lean();
  if (!user) return buildResponse(404, "User not found or inactive");
  const group = await conversationRepo.addGroupMember(conversationId, validation.userId, authenticatedUserId);
  const response = buildResponse(200, "Member added successfully", await buildConversationResponse(group, context.membership));
  response.notifyUserIds = group.participantIds.map(item => String(item._id || item));
  return response;
}

async function removeGroupMember(authenticatedUserId, conversationId, memberUserId) {
  const context = await requireGroupMember(conversationId, authenticatedUserId, true);
  if (context.response) return context.response;
  if (!mongoose.Types.ObjectId.isValid(memberUserId)) return buildResponse(400, "Invalid member user id");
  if (String(memberUserId) === String(authenticatedUserId)) return buildResponse(409, "Use the leave-group action to remove yourself");
  const target = await conversationRepo.findActiveMembership(conversationId, memberUserId);
  if (!target) return buildResponse(404, "Group member not found");
  const previousUserIds = context.group.participantIds.map(item => String(item._id || item));
  const group = await conversationRepo.removeGroupMember(conversationId, memberUserId);
  const response = buildResponse(200, "Member removed successfully", await buildConversationResponse(group, context.membership));
  response.notifyUserIds = [...new Set([...previousUserIds, String(memberUserId)])];
  return response;
}

async function setGroupAdmin(authenticatedUserId, conversationId, memberUserId, makeAdmin) {
  const context = await requireGroupMember(conversationId, authenticatedUserId, true);
  if (context.response) return context.response;
  if (!mongoose.Types.ObjectId.isValid(memberUserId)) return buildResponse(400, "Invalid member user id");
  const target = await conversationRepo.findActiveMembership(conversationId, memberUserId);
  if (!target) return buildResponse(404, "Group member not found");
  if (!makeAdmin && target.role === ROLE_ADMIN && await conversationRepo.countActiveAdmins(conversationId) <= 1) {
    return buildResponse(409, "A group must retain at least one admin");
  }
  await conversationRepo.setGroupMemberRole(conversationId, memberUserId, makeAdmin ? ROLE_ADMIN : ROLE_MEMBER);
  const group = await conversationRepo.updateGroup(conversationId, {});
  const response = buildResponse(200, makeAdmin ? "Member promoted to admin" : "Admin rights removed", await buildConversationResponse(group, context.membership));
  response.notifyUserIds = group.participantIds.map(item => String(item._id || item));
  return response;
}

async function leaveGroup(authenticatedUserId, conversationId) {
  const context = await requireGroupMember(conversationId, authenticatedUserId);
  if (context.response) return context.response;
  if (context.membership.role === ROLE_ADMIN && await conversationRepo.countActiveAdmins(conversationId) <= 1 && context.group.participantIds.length > 1) {
    return buildResponse(409, "Promote another member to admin before leaving the group");
  }
  const notifyUserIds = context.group.participantIds.map(item => String(item._id || item));
  await conversationRepo.removeGroupMember(conversationId, authenticatedUserId);
  const response = buildResponse(200, "You left the group", null);
  response.notifyUserIds = notifyUserIds;
  return response;
}

module.exports = { createDirect, list, removeForUser, createGroup, getGroup, updateGroup, addGroupMember, removeGroupMember, setGroupAdmin, leaveGroup };
