const Device = require("../models/Device");
const fcm = require("./FcmService");
const logger = require("../utils/logger");

const invalidTokenCodes = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

async function notify(recipientUserIds, { callId, conversationId, callerUserId, callerName, callerProfileUrl, mode }) {
  if (!Array.isArray(recipientUserIds) || !recipientUserIds.length) return;
  const devices = await Device.find({
    userId: { $in: recipientUserIds },
    status: "ACTIVE"
  }).select("+pushToken userId deviceId").lean();

  await Promise.allSettled(devices.filter(device => device.pushToken).map(async device => {
    const result = await fcm.sendDataOnly({
      token: device.pushToken,
      data: {
        type: "CALL_INVITE",
        callId: String(callId),
        conversationId: String(conversationId),
        callerUserId: String(callerUserId),
        callerName: callerName || "A contact",
        callerProfileUrl: callerProfileUrl || "",
        mode: mode === "video" ? "video" : "audio"
      },
      ttlMs: 45 * 1000
    });
    if (invalidTokenCodes.has(result.errorCode)) {
      await Device.updateOne(
        { _id: device._id, pushToken: device.pushToken },
        { $unset: { pushToken: 1, pushPlatform: 1, pushTokenUpdatedAt: 1 } }
      );
    }
  })).catch(error => logger.warn("Incoming call push dispatch failed", { error: error.message }));
}

module.exports = { notify };
