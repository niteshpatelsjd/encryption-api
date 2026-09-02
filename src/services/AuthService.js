const tokenService = require("./TokenService");
const buildResponse = require("../utils/response");

async function refresh(body) {
  if (!body?.refreshToken) return buildResponse(400, "refreshToken is required");
  const tokens = await tokenService.rotate(body.refreshToken);
  return tokens ? buildResponse(200, "Tokens refreshed", tokens) : buildResponse(401, "Invalid or expired refresh token");
}

async function logout(body) {
  if (!body?.refreshToken) return buildResponse(400, "refreshToken is required");
  const revoked = await tokenService.revoke(body.refreshToken);
  if (revoked) {
    await require("../socket/PresenceService").disconnectDevice(String(revoked.userId), revoked.deviceId);
  }
  return revoked ? buildResponse(200, "Logged out") : buildResponse(200, "Logged out");
}

module.exports = { refresh, logout };
