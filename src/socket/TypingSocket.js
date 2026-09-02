const SocketEvents = require("../constants/SocketEvents");
const typingService = require("../services/TypingService");
const logger = require("../utils/logger");

const DEFAULT_EXPIRY_MS = 5000;
const DEFAULT_THROTTLE_MS = 750;

function initializeTyping(io, socket, options = {}) {
  const expiryMs = options.expiryMs || DEFAULT_EXPIRY_MS;
  const throttleMs = options.throttleMs || DEFAULT_THROTTLE_MS;
  const states = new Map();

  function emitUpdate(recipientUserIds, conversationId, isTyping) {
    const update = {
      conversationId,
      userId: socket.data.userId,
      deviceId: socket.data.deviceId,
      isTyping,
      timestamp: new Date().toISOString()
    };
    recipientUserIds.forEach(userId => {
      io.to(`user:${userId}`).emit(SocketEvents.TYPING_UPDATE, update);
    });
  }

  function clearState(conversationId, notify) {
    const state = states.get(conversationId);
    if (!state) return false;
    clearTimeout(state.timer);
    states.delete(conversationId);
    if (notify && state.isTyping) emitUpdate(state.recipientUserIds, conversationId, false);
    return true;
  }

  socket.on(SocketEvents.TYPING_START, async (payload, acknowledge) => {
    try {
      const authorization = await typingService.authorize({
        conversationId: payload?.conversationId,
        userId: socket.data.userId,
        deviceId: socket.data.deviceId
      });
      if (!authorization.success) {
        if (typeof acknowledge === "function") acknowledge(authorization);
        return;
      }

      const conversationId = authorization.conversationId;
      const previous = states.get(conversationId);
      if (previous?.timer) clearTimeout(previous.timer);
      const now = Date.now();
      const shouldEmit = !previous?.isTyping || now - previous.lastEmittedAt >= throttleMs;
      if (shouldEmit) emitUpdate(authorization.recipientUserIds, conversationId, true);

      const state = {
        isTyping: true,
        recipientUserIds: authorization.recipientUserIds,
        lastEmittedAt: shouldEmit ? now : previous.lastEmittedAt,
        timer: null
      };
      state.timer = setTimeout(() => clearState(conversationId, true), expiryMs);
      states.set(conversationId, state);
      if (typeof acknowledge === "function") acknowledge({ success: true, conversationId, throttled: !shouldEmit });
    } catch (error) {
      logger.error("Typing start processing failed", { userId: socket.data.userId, deviceId: socket.data.deviceId, error: error.message });
      if (typeof acknowledge === "function") acknowledge({ success: false, errorCode: "INVALID_TYPING_EVENT", message: "Unable to update typing status." });
    }
  });

  socket.on(SocketEvents.TYPING_STOP, async (payload, acknowledge) => {
    try {
      const authorization = await typingService.authorize({
        conversationId: payload?.conversationId,
        userId: socket.data.userId,
        deviceId: socket.data.deviceId
      });
      if (!authorization.success) {
        if (typeof acknowledge === "function") acknowledge(authorization);
        return;
      }
      const stopped = clearState(authorization.conversationId, true);
      if (typeof acknowledge === "function") acknowledge({ success: true, conversationId: authorization.conversationId, stopped });
    } catch (error) {
      logger.error("Typing stop processing failed", { userId: socket.data.userId, deviceId: socket.data.deviceId, error: error.message });
      if (typeof acknowledge === "function") acknowledge({ success: false, errorCode: "INVALID_TYPING_EVENT", message: "Unable to update typing status." });
    }
  });

  socket.on("disconnect", () => {
    [...states.keys()].forEach(conversationId => clearState(conversationId, true));
  });
}

module.exports = { initializeTyping, DEFAULT_EXPIRY_MS, DEFAULT_THROTTLE_MS };
