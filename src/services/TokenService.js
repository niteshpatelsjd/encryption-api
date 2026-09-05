const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/RefreshToken");
const Device = require("../models/Device");
const User = require("../models/User");
const access = require("./MobileAccessService");
const { hash, randomToken } = require("../utils/security");
const { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_DAYS } = require("../constants/SecurityConstants");

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT access secret is not configured");
  return secret;
}

function createAccessToken(userId, deviceId) {
  return jwt.sign({ userId, deviceId, purpose: "ACCESS" }, accessSecret(), { expiresIn: ACCESS_TOKEN_TTL, issuer: "encryption-api" });
}

async function createRefreshToken(userId, deviceId) {
  await access.assertActive(userId, deviceId);
  const token = randomToken(48);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400000);
  await RefreshToken.create({ tokenHash: hash(token), userId, deviceId, expiresAt });
  try {
    await access.assertActive(userId, deviceId);
  } catch (error) {
    await RefreshToken.updateMany({ userId, deviceId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw error;
  }
  return { token, expiresAt };
}

async function issueTokenPair(userId, deviceId) {
  const refresh = await createRefreshToken(userId, deviceId);
  return { accessToken: createAccessToken(userId, deviceId), accessTokenExpiresIn: ACCESS_TOKEN_TTL, refreshToken: refresh.token, refreshTokenExpiresAt: refresh.expiresAt };
}

async function rotate(refreshToken) {
  const tokenHash = hash(refreshToken || "");
  // Keep revoked token records: their identity lets offline devices receive the
  // stable DEVICE_REVOKED code instead of an ambiguous invalid-token response.
  const identity = await RefreshToken.findOne({ tokenHash });
  if (!identity) return null;
  await access.assertActive(identity.userId, identity.deviceId);
  const record = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (!record) return null;
  const [activeDevice, user] = await Promise.all([
    Device.exists({ userId: record.userId, deviceId: record.deviceId, status: "ACTIVE" }),
    User.findOne({ _id: record.userId, status: 1 }).select("activeDeviceId").lean()
  ]);
  if (!activeDevice || !user || (user.activeDeviceId && user.activeDeviceId !== record.deviceId)) return null;
  const replacement = await createRefreshToken(record.userId, record.deviceId);
  record.replacedByTokenHash = hash(replacement.token);
  await record.save();
  return { accessToken: createAccessToken(record.userId.toString(), record.deviceId), accessTokenExpiresIn: ACCESS_TOKEN_TTL, refreshToken: replacement.token, refreshTokenExpiresAt: replacement.expiresAt };
}

async function revoke(refreshToken) {
  return RefreshToken.findOneAndUpdate({ tokenHash: hash(refreshToken || ""), revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true });
}

module.exports = { issueTokenPair, rotate, revoke };
