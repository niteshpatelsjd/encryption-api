const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Device = require("../models/Device");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

function denied(code, message, statusCode = 401) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function assertActive(userId, deviceId) {
  if (!mongoose.isValidObjectId(userId) || typeof deviceId !== "string" || !deviceId) {
    throw denied("INVALID_ACCESS_TOKEN", "Invalid mobile identity");
  }
  const device = await Device.findOne({ userId, deviceId }).select("status revokedAt").lean();
  if (device?.status === "REVOKED") throw denied("DEVICE_REVOKED", "This device has been revoked");
  if (!device || device.status !== "ACTIVE") throw denied("DEVICE_NOT_REGISTERED", "Device is not active");
  const user = await User.findOne({ _id: userId, status: 1 }).select("activeDeviceId").lean();
  if (!user) throw denied("ACCOUNT_INACTIVE", "Account is unavailable");
  if (user.activeDeviceId && user.activeDeviceId !== deviceId) throw denied("DEVICE_REVOKED", "This device has been replaced");
}

async function verifyAccess(token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
      { algorithms: ["HS256"], issuer: "encryption-api" });
  } catch (error) {
    throw denied(error.name === "TokenExpiredError" ? "ACCESS_TOKEN_EXPIRED" : "INVALID_ACCESS_TOKEN", "Invalid or expired access token");
  }
  if (payload.purpose !== "ACCESS") throw denied("INVALID_ACCESS_TOKEN", "Mobile access token required");
  await assertActive(payload.userId, payload.deviceId);
  if (!await RefreshToken.exists({ userId: payload.userId, deviceId: payload.deviceId, revokedAt: null, expiresAt: { $gt: new Date() } })) {
    throw denied("SESSION_REVOKED", "Device session has ended");
  }
  return payload;
}

function response(error) {
  const status = error.statusCode || 503;
  return { responseCode: status, message: error.statusCode ? error.message : "Authentication service unavailable",
    responseBody: { code: error.code && error.statusCode ? error.code : "AUTH_SERVICE_UNAVAILABLE" } };
}

module.exports = { assertActive, verifyAccess, denied, response };
