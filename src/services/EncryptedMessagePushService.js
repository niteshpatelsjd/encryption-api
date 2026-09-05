const Device = require("../models/Device");
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
  await Promise.allSettled(devices.map(async device => {
    const delivery = targets.find(item => String(item.recipientUserId) === String(device.userId)
      && item.recipientDeviceId === device.deviceId);
    if (!delivery) return;
    const notification = await notifications.upsertEncryptedMessage({
      userId: device.userId,
      deviceId: device.deviceId,
      conversationId: delivery.payload.conversationId,
      serverMessageId: delivery.payload.serverMessageId
    });
    const result = await fcm.sendNotification({
      token: device.pushToken,
      title: notifications.TITLE,
      message: notifications.MESSAGE,
      data: {
        type: "NEW_MESSAGE",
        conversationId: String(delivery.payload.conversationId),
        serverMessageId: String(delivery.payload.serverMessageId),
        notificationId: String(notification._id)
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
