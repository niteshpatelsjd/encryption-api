const tokenService = require("./TokenService");
const buildResponse = require("../utils/response");
const Device = require("../models/Device");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

async function refresh(body) {
  if (!body?.refreshToken) return buildResponse(400, "refreshToken is required");
  try {
    const tokens = await tokenService.rotate(body.refreshToken);
    return tokens ? buildResponse(200, "Tokens refreshed", tokens) : buildResponse(401, "Invalid or expired refresh token", { code: "INVALID_REFRESH_TOKEN" });
  } catch (error) {
    return require("./MobileAccessService").response(error);
  }
}

async function logout(body) {
  if (!body?.refreshToken) return buildResponse(400, "refreshToken is required");
  const revoked = await tokenService.revoke(body.refreshToken);
  if (revoked) {
    const { userId, deviceId } = revoked;
    // Only the authenticated token's device is affected. A delayed logout must
    // never clear the active-device pointer of a replacement device.
    await Device.updateOne(
      { userId, deviceId, status: "ACTIVE" },
      { $set: { status: "REVOKED", revokedAt: new Date() } }
    );
    await Promise.all([
      RefreshToken.updateMany(
        { userId, deviceId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      ),
      User.updateOne(
        { _id: userId, activeDeviceId: deviceId },
        { $set: { activeDeviceId: null } }
      )
    ]);
    await require("../socket/PresenceService").disconnectDevice(String(userId), deviceId);
  }
  return buildResponse(200, "Logged out");
}

module.exports = { refresh, logout };
