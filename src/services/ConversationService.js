const User = require("../models/User");
const mongoose = require("mongoose");
const conversationRepo = require("../repositories/ConversationRepository");
const buildResponse = require("../utils/response");
const s3Util = require("../utils/s3Util");
const logger = require("../utils/logger");
const Message = require("../models/Message");
const { validateCreateConversation, parseConversationListQuery } = require("../validators/ConversationValidator");

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
  const { limit, cursor: encodedCursor } = parseConversationListQuery(query);
  const cursor = decodeCursor(encodedCursor);
  if (encodedCursor && !cursor) return buildResponse(400, "Invalid conversation cursor");

  const result = await conversationRepo.listForUser({
    userId: authenticatedUserId,
    limit,
    cursor
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

module.exports = { createDirect, list, removeForUser };
