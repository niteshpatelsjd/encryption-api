const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const buildResponse = require("../utils/response");

const TITLE = "New encrypted message";
const MESSAGE = "Open Encryption App to view it.";

const pageNumber = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const ownership = (userId, deviceId) => ({ userId, $or: [{ deviceId }, { deviceId: null }] });

async function list(userId, deviceId, query = {}) {
  const pageIndex = pageNumber(query.pageIndex, 0, 0, Number.MAX_SAFE_INTEGER);
  const pageSize = pageNumber(query.pageSize, 20, 1, 100);
  const filter = { ...ownership(userId, deviceId), status: { $ne: 0 } };
  if (query.isRead === "true" || query.isRead === true) filter.isRead = true;
  if (query.isRead === "false" || query.isRead === false) filter.isRead = false;
  const [content, totalRecords, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(pageIndex * pageSize).limit(pageSize).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...ownership(userId, deviceId), status: { $ne: 0 }, isRead: false })
  ]);
  return buildResponse(200, "Notifications fetched", {
    content,
    unreadCount,
    pageIndex,
    pageSize,
    totalRecords,
    totalPages: Math.ceil(totalRecords / pageSize)
  });
}

async function markRead(userId, deviceId, id) {
  if (!mongoose.isValidObjectId(id)) return buildResponse(404, "Notification not found");
  const notification = await Notification.findOneAndUpdate(
    { _id: id, ...ownership(userId, deviceId), status: { $ne: 0 } },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();
  return notification
    ? buildResponse(200, "Notification marked as read", notification)
    : buildResponse(404, "Notification not found");
}

async function markAllRead(userId, deviceId) {
  const result = await Notification.updateMany(
    { ...ownership(userId, deviceId), status: { $ne: 0 }, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return buildResponse(200, "All notifications marked as read", { updatedCount: result.modifiedCount || 0 });
}

async function remove(userId, deviceId, id) {
  if (!mongoose.isValidObjectId(id)) return buildResponse(404, "Notification not found");
  const notification = await Notification.findOneAndUpdate(
    { _id: id, ...ownership(userId, deviceId), status: { $ne: 0 } },
    { $set: { status: 0 } },
    { new: true }
  ).lean();
  return notification
    ? buildResponse(200, "Notification deleted")
    : buildResponse(404, "Notification not found");
}

async function upsertEncryptedMessage({ userId, deviceId, conversationId, serverMessageId }) {
  const dedupeKey = `NEW_MESSAGE:${userId}:${deviceId}:${serverMessageId}`;
  return Notification.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        userId,
        deviceId,
        title: TITLE,
        message: MESSAGE,
        type: "NEW_MESSAGE",
        data: { type: "NEW_MESSAGE", conversationId, serverMessageId },
        dedupeKey,
        sentStatus: "PENDING"
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function recordDelivery(id, result) {
  await Notification.updateOne(
    { _id: id },
    { $set: {
      sentStatus: result.sentStatus || "FAILED",
      firebaseMessageId: result.firebaseMessageId || null,
      failureReason: result.failureReason || null
    } }
  );
}

module.exports = { list, markRead, markAllRead, remove, upsertEncryptedMessage, recordDelivery, TITLE, MESSAGE };
