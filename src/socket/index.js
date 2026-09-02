const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Device = require("../models/Device");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { initializePresence, setPresenceServer } = require("./PresenceService");
const { initializeMessaging, deviceRoom } = require("./MessagingSocket");
const { initializeTyping } = require("./TypingSocket");

function socketAuthError(code, message, reason = null) {
  const error = new Error(message);
  error.data = { code, reason };
  return error;
}

module.exports = function initializeSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: process.env.SOCKET_CORS_ORIGIN || "*" } });
  setPresenceServer(io);
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const suppliedDeviceId = socket.handshake.auth?.deviceId;

    if (!token) return next(socketAuthError("AUTHENTICATION_FAILED", "Access token is required"));
    if (!suppliedDeviceId) return next(socketAuthError("DEVICE_NOT_REGISTERED", "Device ID is required"));

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET);
      if (payload.purpose !== "ACCESS") {
        return next(socketAuthError("AUTHENTICATION_FAILED", "Invalid access token"));
      }
    } catch (error) {
      const reason = error.name === "TokenExpiredError"
        ? "ACCESS_TOKEN_EXPIRED"
        : "INVALID_ACCESS_TOKEN";
      return next(socketAuthError(
        "AUTHENTICATION_FAILED",
        "Socket authentication failed",
        reason
      ));
    }

    if (String(payload.deviceId) !== String(suppliedDeviceId)) {
      return next(socketAuthError("DEVICE_NOT_REGISTERED", "Device does not match access token"));
    }

    try {
      const [user, device, session] = await Promise.all([
        User.findOne({ _id: payload.userId, status: 1 }).select("_id").lean(),
        Device.findOne({ userId: payload.userId, deviceId: payload.deviceId, status: "ACTIVE" }).select("_id").lean(),
        RefreshToken.exists({ userId: payload.userId, deviceId: payload.deviceId, revokedAt: null, expiresAt: { $gt: new Date() } })
      ]);
      if (!user) return next(socketAuthError("AUTHENTICATION_FAILED", "User is blocked or unavailable"));
      if (!device) return next(socketAuthError("DEVICE_NOT_REGISTERED", "Device is not active"));
      if (!session) return next(socketAuthError("AUTHENTICATION_FAILED", "Device session has ended"));
      socket.data.userId = String(payload.userId);
      socket.data.deviceId = String(payload.deviceId);
      return next();
    } catch (_error) {
      return next(socketAuthError("SERVER_UNAVAILABLE", "Unable to validate socket session"));
    }
  });
  io.on("connection", socket => {
    socket.join(`user:${socket.data.userId}`);
    socket.join(deviceRoom(socket.data.userId, socket.data.deviceId));
    initializePresence(io, socket);
    initializeMessaging(io, socket);
    initializeTyping(io, socket);
  });
  return io;
};
