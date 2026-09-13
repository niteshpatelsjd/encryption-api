const Device = require("../models/Device");
const fcm = require("./FcmService");
const logger = require("../utils/logger");

const invalidTokenCodes = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

function inviteData({ callId, conversationId, callerUserId, callerName, callerProfileUrl, mode }) {
  return {
    type: "CALL_INVITE",
    callId: String(callId),
    conversationId: String(conversationId),
    callerUserId: String(callerUserId),
    callerName: callerName || "A contact",
    callerProfileUrl: callerProfileUrl || "",
    mode: mode === "video" ? "video" : "audio"
  };
}

async function activeDevices(userIds) {
  if (!Array.isArray(userIds) || !userIds.length) return [];
  return Device.find({
    userId: { $in: userIds },
    status: "ACTIVE",
    pushToken: { $type: "string", $ne: "" }
  }).select("+pushToken userId deviceId deviceType").lean();
}

async function cleanupInvalidToken(device, result) {
  if (!invalidTokenCodes.has(result.errorCode)) return;
  await Device.updateOne(
    { _id: device._id, pushToken: device.pushToken },
    { $unset: { pushToken: 1, pushPlatform: 1, pushTokenUpdatedAt: 1 } }
  );
}

async function deliver(device, send, callId) {
  const startedAt = Date.now();
  try {
    const result = await send();
    if (result.sentStatus !== "SENT") {
      logger.warn("Call push delivery failed", {
        callId: String(callId), deviceId: device.deviceId, platform: device.deviceType,
        errorCode: result.errorCode || null, durationMs: Date.now() - startedAt
      });
    }
    await cleanupInvalidToken(device, result);
  } catch (error) {
    logger.warn("Call push delivery failed", {
      callId: String(callId), deviceId: device.deviceId, platform: device.deviceType,
      errorCode: error.code || null, durationMs: Date.now() - startedAt
    });
  }
}

async function notify(recipientUserIds, invite, options = {}) {
  const data = inviteData(invite);
  const devices = (await activeDevices(recipientUserIds)).filter(device =>
    !(String(device.userId) === String(options.callerUserId) && device.deviceId === options.callerDeviceId));
  await Promise.allSettled(devices.map(device => deliver(device, () =>
    device.deviceType === "IOS"
      ? fcm.sendIosCallAlert({
        token: device.pushToken, data, callerName: data.callerName,
        mode: data.mode, callId: data.callId
      })
      : fcm.sendDataOnly({ token: device.pushToken, data, ttlMs: 45 * 1000 }),
  data.callId)));
}

async function notifyState(userIds, { type, callId, conversationId, state }) {
  const data = {
    type: String(type),
    callId: String(callId),
    conversationId: String(conversationId),
    state: String(state)
  };
  const devices = await activeDevices(userIds);
  await Promise.allSettled(devices.map(device => deliver(device,
    () => fcm.sendDataOnly({ token: device.pushToken, data, ttlMs: 45 * 1000 }), data.callId)));
}

module.exports = { notify, notifyState, inviteData };
