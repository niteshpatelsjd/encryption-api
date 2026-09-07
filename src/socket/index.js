const { Server } = require("socket.io");
const { initializePresence, setPresenceServer } = require("./PresenceService");
const { initializeMessaging, deviceRoom } = require("./MessagingSocket");
const { initializeTyping } = require("./TypingSocket");
const { authenticate, protectEvents } = require("./MobileSocketAccess");

module.exports = function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.SOCKET_CORS_ORIGIN || "*" },
    transports: ["websocket", "polling"],
    perMessageDeflate: false,
    pingInterval: 20000,
    pingTimeout: 20000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      // Authentication and active-device checks must also run after recovery.
      skipMiddlewares: false
    }
  });
  setPresenceServer(io);
  io.use(authenticate);
  io.on("connection", socket => {
    protectEvents(socket);
    socket.join(`user:${socket.data.userId}`);
    socket.join(deviceRoom(socket.data.userId, socket.data.deviceId));
    initializePresence(io, socket);
    initializeMessaging(io, socket);
    initializeTyping(io, socket);
  });
  return io;
};
