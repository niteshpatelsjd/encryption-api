const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const ConversationMember = require("../models/ConversationMember");
const Message = require("../models/Message");
const Attachment = require("../models/Attachment");
const CallSession = require("../models/CallSession");
const { TYPE_DIRECT, STATUS_ACTIVE } = require("../constants/ConversationConstants");

const participantPopulation = {
  path: "participantIds",
  select: "name profileImageKey status"
};

async function ensureMembers(conversationId, participantIds) {
  await Promise.all(
    participantIds.map(userId => ConversationMember.updateOne(
      { conversationId, userId },
      {
        $setOnInsert: {
          conversationId,
          userId,
          role: "MEMBER",
          joinedAt: new Date(),
          status: STATUS_ACTIVE
        }
      },
      { upsert: true }
    ))
  );
}

async function findOrCreateDirect({ participantIds, directConversationKey, createdBy }) {
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { type: TYPE_DIRECT, directConversationKey },
      {
        $setOnInsert: {
          type: TYPE_DIRECT,
          participantIds,
          directConversationKey,
          createdBy,
          activityAt: new Date(),
          status: STATUS_ACTIVE
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    conversation = await Conversation.findOne({ type: TYPE_DIRECT, directConversationKey });
  }

  await ensureMembers(conversation._id, participantIds);
  return Conversation.findById(conversation._id).populate(participantPopulation);
}

async function listForUser({ userId, limit, cursor }) {
  const memberships = await ConversationMember.find({
    userId,
    status: STATUS_ACTIVE,
    hidden: { $ne: true }
  }).select("conversationId userId archived muted hidden lastReadMessageId lastReadAt").lean();

  if (!memberships.length) return { conversations: [], memberships: new Map(), hasMore: false };

  const membershipByConversation = new Map(
    memberships.map(member => [String(member.conversationId), member])
  );

  const query = {
    _id: { $in: memberships.map(member => member.conversationId) },
    status: STATUS_ACTIVE
  };

  if (cursor) {
    const cursorId = new mongoose.Types.ObjectId(cursor.id);
    const cursorActivityAt = new Date(cursor.activityAt);
    query.$or = [
      { activityAt: { $lt: cursorActivityAt } },
      { activityAt: cursorActivityAt, _id: { $lt: cursorId } }
    ];
  }

  const records = await Conversation.find(query)
    .populate(participantPopulation)
    .sort({ activityAt: -1, _id: -1 })
    .limit(limit + 1);

  const hasMore = records.length > limit;
  if (hasMore) records.pop();
  return { conversations: records, memberships: membershipByConversation, hasMore };
}

async function markRead({ conversationId, userId, messageId, readAt }) {
  return ConversationMember.findOneAndUpdate(
    { conversationId, userId, status: STATUS_ACTIVE, $or: [{ lastReadAt: null }, { lastReadAt: { $lt: readAt } }] },
    { $set: { lastReadMessageId: messageId, lastReadAt: readAt } },
    { new: true }
  );
}

const hideForUser = (conversationId, userId) => ConversationMember.findOneAndUpdate(
  { conversationId, userId, status: STATUS_ACTIVE },
  { $set: { hidden: true } },
  { new: true }
);

const restoreForUsers = (conversationId, userIds) => ConversationMember.updateMany(
  { conversationId, userId: { $in: userIds }, status: STATUS_ACTIVE, hidden: true },
  { $set: { hidden: false } }
);

async function hardDeleteForMember(conversationId, userId) {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participantIds: userId,
    status: STATUS_ACTIVE
  }).select("_id participantIds").lean();
  if (!conversation) return null;

  const messages = await Message.find({ conversationId }).select("_id").lean();
  const messageIds = messages.map(message => message._id);
  const attachments = messageIds.length
    ? await Attachment.find({ messageId: { $in: messageIds } }).select("s3Key").lean()
    : [];

  const removed = await Conversation.deleteOne({
    _id: conversationId,
    participantIds: userId,
    status: STATUS_ACTIVE
  });
  if (removed.deletedCount !== 1) return null;

  await Promise.all([
    ConversationMember.deleteMany({ conversationId }),
    Message.deleteMany({ conversationId }),
    CallSession.deleteMany({ conversationId }),
    messageIds.length
      ? Attachment.deleteMany({ messageId: { $in: messageIds } })
      : Promise.resolve()
  ]);

  return {
    participantUserIds: conversation.participantIds.map(String),
    attachmentKeys: attachments.map(attachment => attachment.s3Key).filter(Boolean)
  };
}

module.exports = { findOrCreateDirect, listForUser, markRead, hideForUser, restoreForUsers, hardDeleteForMember };
