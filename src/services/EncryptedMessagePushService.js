const Device = require("../models/Device");
const User = require("../models/User");
const s3Util = require("../utils/s3Util");
const fcm = require("./FcmService");
const notifications = require("./MobileNotificationService");
const logger = require("../utils/logger");
const mongoose = require("mongoose");

const invalidTokenCodes = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

async function notify(deliveries) {
  const eligible = deliveries.filter(item => mongoose.isValidObjectId(item.recipientUserId));
  const targets = [...new Map(eligible.map(item => [
    `${item.recipientUserId}:${item.recipientDeviceId}`,
    item
  ])).values()];
  if (!targets.length) return;
  const devices = await Device.find({
    status: "ACTIVE",
    $or: targets.map(item => ({ userId: item.recipientUserId, deviceId: item.recipientDeviceId }))
  }).select("+pushToken userId deviceId").lean();
  const senderIds = [...new Set(targets
    .map(item => String(item.payload.senderUserId || ""))
    .filter(id => mongoose.isValidObjectId(id)))];
  const senders = senderIds.length
    ? await User.find({ _id: { $in: senderIds }, status: 1 })
      .select("name profileImageKey profileUrl")
      .lean()
    : [];
  const senderProfiles = new Map(await Promise.all(senders.map(async sender => [
    String(sender._id),
    {
      name: sender.name || "Encryption App contact",
      profileUrl: sender.profileImageKey
        ? await s3Util.getPreSignedUrl(sender.profileImageKey).catch(() => sender.profileUrl || "")
        : sender.profileUrl || ""
    }
  ])));
  await Promise.allSettled(devices.map(async device => {
    const delivery = targets.find(item => String(item.recipientUserId) === String(device.userId)
      && item.recipientDeviceId === device.deviceId);
    if (!delivery) return;
    const sender = senderProfiles.get(String(delivery.payload.senderUserId || ""));
    const senderName = sender?.name || "Encryption App contact";
    const senderProfileUrl = sender?.profileUrl || "";
    const notification = await notifications.upsertEncryptedMessage({
      userId: device.userId,
      deviceId: device.deviceId,
      conversationId: delivery.payload.conversationId,
      serverMessageId: delivery.payload.serverMessageId,
      senderUserId: delivery.payload.senderUserId,
      senderName
    });
    const result = await fcm.sendNotification({
      token: device.pushToken,
      title: senderName,
      message: "Sent you an encrypted message",
      imageUrl: senderProfileUrl || undefined,
      groupKey: `chat-${String(delivery.payload.conversationId)}`,
      data: {
        type: "NEW_MESSAGE",
        conversationId: String(delivery.payload.conversationId),
        serverMessageId: String(delivery.payload.serverMessageId),
        notificationId: String(notification._id),
        senderUserId: String(delivery.payload.senderUserId || ""),
        senderName,
        ...(senderProfileUrl ? { senderProfileUrl } : {})
      }
    });
    await notifications.recordDelivery(notification._id, result);
    if (invalidTokenCodes.has(result.errorCode)) {
      await Device.updateOne({ _id: device._id, pushToken: device.pushToken },
        { $unset: { pushToken: 1, pushPlatform: 1, pushTokenUpdatedAt: 1 } });
    }
  })).catch(error => logger.warn("Encrypted message push dispatch failed", { error: error.message }));
}

module.exports = { notify };
