const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const mongoose = require("mongoose");

async function findByClientMessageId(senderUserId, senderDeviceId, clientMessageId) {
  return Message.findOne({ senderUserId, senderDeviceId, clientMessageId });
}

async function createIdempotent(data) {
  const existing = await findByClientMessageId(data.senderUserId, data.senderDeviceId, data.clientMessageId);
  if (existing) return { message: existing, created: false };
  try {
    return { message: await Message.create(data), created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicate = await findByClientMessageId(data.senderUserId, data.senderDeviceId, data.clientMessageId);
    if (!duplicate) throw error;
    return { message: duplicate, created: false };
  }
}

const findActionTarget = (conversationId, clientMessageId) => Message.findOne({
  conversationId,
  clientMessageId,
  action: null
}).select("_id conversationId clientMessageId senderUserId expiresAt").lean();

const updateConversationActivity = message => Conversation.updateOne(
  { _id: message.conversationId, status: 1 },
  { $set: { lastMessageId: message._id, lastMessageAt: message.createdAt, activityAt: message.createdAt } }
);

function cursorMatch(cursor, direction) {
  if (!cursor) return null;
  const operator = direction === "after" ? "$gt" : "$lt";
  return { $or: [
    { createdAt: { [operator]: new Date(cursor.createdAt) } },
    { createdAt: new Date(cursor.createdAt), _id: { [operator]: new mongoose.Types.ObjectId(cursor.id) } }
  ] };
}

function deviceEnvelopeProjection(userId, deviceId, sentOnly) {
  const conditions = [
    { $eq: ["$$envelope.recipientUserId", new mongoose.Types.ObjectId(userId)] },
    { $eq: ["$$envelope.recipientDeviceId", deviceId] }
  ];
  if (sentOnly) conditions.push({ $eq: ["$$envelope.status", "SENT"] });
  return { $filter: { input: "$envelopes", as: "envelope", cond: { $and: conditions } } };
}

async function syncForDevice({ userId, deviceId, limit, cursor }) {
  const match = {
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }],
    envelopes: { $elemMatch: { recipientUserId: new mongoose.Types.ObjectId(userId), recipientDeviceId: deviceId, status: "SENT" } }
  };
  const cursorFilter = cursorMatch(cursor, "after");
  if (cursorFilter) match.$and.push(cursorFilter);
  return Message.aggregate([
    { $match: match },
    { $sort: { createdAt: 1, _id: 1 } },
    { $limit: limit + 1 },
    { $project: {
      conversationId: 1,
      clientMessageId: 1,
      senderUserId: 1,
      senderDeviceId: 1,
      messageType: 1,
      encryptionVersion: 1,
      action: 1,
      createdAt: 1,
      expiresAt: 1,
      envelopes: deviceEnvelopeProjection(userId, deviceId, true)
    } }
  ]);
}

async function historyForDevice({ conversationId, userId, deviceId, limit, cursor }) {
  const match = {
    conversationId: new mongoose.Types.ObjectId(conversationId),
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }]
  };
  const cursorFilter = cursorMatch(cursor, "before");
  if (cursorFilter) match.$and.push(cursorFilter);
  return Message.aggregate([
    { $match: match },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: limit + 1 },
    { $project: {
      conversationId: 1,
      clientMessageId: 1,
      senderUserId: 1,
      senderDeviceId: 1,
      messageType: 1,
      encryptionVersion: 1,
      action: 1,
      createdAt: 1,
      expiresAt: 1,
      envelopes: deviceEnvelopeProjection(userId, deviceId, false)
    } }
  ]);
}

const findReceiptContext = messageId => Message.findById(messageId)
  .select("conversationId senderUserId createdAt envelopes.recipientUserId envelopes.recipientDeviceId envelopes.status envelopes.deliveredAt envelopes.readAt")
  .lean();

async function updateReceipt(messageId, userId, deviceId, receiptType) {
  const now = new Date();
  const isRead = receiptType === "READ";
  const allowedStatuses = isRead ? ["SENT", "DELIVERED"] : ["SENT"];
  const targetCondition = { $and: [
    { $eq: ["$$envelope.recipientUserId", new mongoose.Types.ObjectId(userId)] },
    { $eq: ["$$envelope.recipientDeviceId", deviceId] },
    { $in: ["$$envelope.status", allowedStatuses] }
  ] };
  const updatedEnvelope = isRead
    ? { $mergeObjects: ["$$envelope", {
      status: "READ",
      deliveredAt: { $ifNull: ["$$envelope.deliveredAt", now] },
      readAt: now
    }] }
    : { $mergeObjects: ["$$envelope", { status: "DELIVERED", deliveredAt: now }] };
  const message = await Message.findOneAndUpdate(
    {
      _id: messageId,
      envelopes: { $elemMatch: { recipientUserId: userId, recipientDeviceId: deviceId, status: { $in: allowedStatuses } } }
    },
    [{ $set: {
      envelopes: { $map: {
        input: "$envelopes",
        as: "envelope",
        in: { $cond: [targetCondition, updatedEnvelope, "$$envelope"] }
      } }
    } }],
    { new: true }
  ).select("conversationId senderUserId envelopes.recipientUserId envelopes.recipientDeviceId envelopes.status envelopes.deliveredAt envelopes.readAt");
  return { message, updated: Boolean(message) };
}

module.exports = {
  findByClientMessageId,
  createIdempotent,
  findActionTarget,
  updateConversationActivity,
  syncForDevice,
  historyForDevice,
  findReceiptContext,
  updateReceipt
};
