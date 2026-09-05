const Device = require("../models/Device");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const DevicePrekey = require("../models/DevicePrekey");
const OneTimePrekey = require("../models/OneTimePrekey");
const SecurityEvent = require("../models/SecurityEvent");
const mongoose = require("mongoose");
const buildResponse = require("../utils/response");

async function revoke(userId, deviceId, actor = {}) {
  if (!mongoose.isValidObjectId(userId) || typeof deviceId !== "string" || !deviceId.trim() || deviceId.length > 256) {
    return buildResponse(400, "Valid userId and deviceId are required", { code: "INVALID_DEVICE_TARGET" });
  }
  // Persist the deny marker FIRST. All authorization paths check this marker,
  // even if cleanup fails. Retry reruns cleanup; it never reactivates the device.
  let device = await Device.findOneAndUpdate(
    { userId, deviceId, status: "ACTIVE" },
    { $set: { status: "REVOKED", revokedAt: new Date() } },
    { new: true, writeConcern: { w: "majority" } }
  );
  const alreadyRevoked = !device;
  if (!device) device = await Device.findOne({ userId, deviceId, status: "REVOKED" });
  if (!device) return buildResponse(404, "Device not found", { code: "DEVICE_NOT_FOUND" });

  const payload = { code: "DEVICE_REVOKED", userId: String(userId), deviceId,
    reason: actor.adminUserId ? "ADMIN_REVOKED" : "USER_REVOKED",
    revokedAt: (device.revokedAt || new Date()).toISOString() };
  let cleanupFailed = false;
  try {
    // refresh_tokens is the mobile session store. UserSession is an unrelated
    // legacy/admin store, and must never be changed by mobile revocation.
    await RefreshToken.updateMany({ userId, deviceId, revokedAt: null }, { $set: { revokedAt: device.revokedAt || new Date() } });
    await DevicePrekey.deleteMany({ userId, deviceId });
    await OneTimePrekey.deleteMany({ userId, deviceId });
    await User.updateOne({ _id: userId, activeDeviceId: deviceId }, { $set: { activeDeviceId: null } });
  } catch (_error) {
    cleanupFailed = true;
  }
  try {
    await SecurityEvent.create({ userId, deviceId, type: "DEVICE_REVOKED", outcome: cleanupFailed ? "FAILURE" : "SUCCESS",
      ipAddress: actor.ip, metadata: { actorType: actor.adminUserId ? "ADMIN" : "MOBILE_USER",
        actorId: actor.adminUserId || userId, alreadyRevoked, cleanupPending: cleanupFailed } });
  } catch (_error) {
    cleanupFailed = true;
  }
  let notificationPending = false;
  try {
    await require("../socket/PresenceService").revokeDeviceConnections(payload);
  } catch (_error) {
    notificationPending = true;
  }
  if (cleanupFailed) return buildResponse(503, "Device access revoked; retry to finish cleanup and audit", {
    ...payload, code: "REVOCATION_CLEANUP_PENDING"
  });
  return buildResponse(200, "Device revoked", { ...payload, alreadyRevoked, notificationPending });
}

module.exports = { revoke };
