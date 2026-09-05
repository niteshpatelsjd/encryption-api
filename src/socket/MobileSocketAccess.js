const access = require("../services/MobileAccessService");
const events = require("../constants/SocketEvents");
const allowedEvents = new Set([events.MESSAGE_SEND, events.MESSAGE_DELIVERED, events.MESSAGE_READ,
  events.TYPING_START, events.TYPING_STOP, events.PRESENCE_SUBSCRIBE, events.PRESENCE_UNSUBSCRIBE]);

function socketError(error) {
  const response = access.response(error);
  return Object.assign(new Error(response.message), { data: { code: response.responseBody.code } });
}

async function authenticate(socket, next) {
  try {
    const payload = await access.verifyAccess(socket.handshake.auth?.token || "");
    if (socket.handshake.auth?.deviceId && socket.handshake.auth.deviceId !== payload.deviceId) {
      throw access.denied("DEVICE_ID_MISMATCH", "Device does not match access token");
    }
    socket.data.userId = String(payload.userId);
    socket.data.deviceId = payload.deviceId;
    next();
  } catch (error) { next(socketError(error)); }
}

function protectEvents(socket) {
  socket.use(async (packet, next) => {
    try {
      await access.verifyAccess(socket.handshake.auth?.token || "");
      if (!allowedEvents.has(packet[0])) throw access.denied("EVENT_NOT_ALLOWED", "Unsupported socket event", 403);
      if (!socket.connected) return;
      next();
    } catch (error) {
      const failure = socketError(error);
      const ack = packet[packet.length - 1];
      if (typeof ack === "function") ack({ success: false, errorCode: failure.data.code, message: failure.message });
      if (failure.data.code === "DEVICE_REVOKED") {
        socket.emit(events.DEVICE_REVOKED, { code: "DEVICE_REVOKED", userId: socket.data.userId,
          deviceId: socket.data.deviceId, reason: "SERVER_REVOKED", revokedAt: null });
        socket.disconnect(true);
      }
      next(failure);
    }
  });
  socket.on("error", () => {}); // Packet errors are already returned through safe acknowledgements.
}

module.exports = { authenticate, protectEvents };
