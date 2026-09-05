const SocketEvents = require("../constants/SocketEvents");
const messagingService = require("../services/MessagingService");
const logger = require("../utils/logger");
const ErrorCodes = require("../constants/MessageErrorCodes");

const deviceRoom = (userId, deviceId) => `device:${userId}:${deviceId}`;

function initializeMessaging(io, socket) {
  socket.on(SocketEvents.MESSAGE_SEND, async (payload, acknowledge) => {
    let result;
    try {
      result = await messagingService.send({
        senderUserId: socket.data.userId,
        senderDeviceId: socket.data.deviceId,
        payload
      });
      if (result.success) {
        if (typeof acknowledge === "function") {
          const { deliveries: _deliveries, ...acknowledgement } = result;
          acknowledge(acknowledgement);
          acknowledge = null;
        }
        result.deliveries.forEach(delivery => {
          io.to(deviceRoom(delivery.recipientUserId, delivery.recipientDeviceId))
            .emit(SocketEvents.MESSAGE_NEW, delivery.payload);
        });
        void require("../services/EncryptedMessagePushService").notify(result.deliveries)
          .catch(error => logger.warn("Encrypted message push deferred", { error: error.message }));
      }
    } catch (error) {
      logger.error("Encrypted message processing failed", {
        event: SocketEvents.MESSAGE_SEND,
        userId: socket.data.userId,
        deviceId: socket.data.deviceId,
        error: error.message
      });
      result = {
        success: false,
        clientMessageId: typeof payload?.clientMessageId === "string" ? payload.clientMessageId : null,
        errorCode: ErrorCodes.INVALID_MESSAGE,
        message: "Unable to send message."
      };
    }
    if (typeof acknowledge === "function") {
      const { deliveries: _deliveries, ...acknowledgement } = result;
      acknowledge(acknowledgement);
    }
  });

  [
    { event: SocketEvents.MESSAGE_DELIVERED, receiptType: "DELIVERED" },
    { event: SocketEvents.MESSAGE_READ, receiptType: "READ" }
  ].forEach(({ event, receiptType }) => {
    socket.on(event, async (payload, acknowledge) => {
      let result;
      try {
        result = await messagingService.receipt({
          userId: socket.data.userId,
          deviceId: socket.data.deviceId,
          payload,
          receiptType
        });
        if (result.success && result.notification) {
          io.to(`user:${result.notification.senderUserId}`)
            .emit(result.notification.event, result.notification.payload);
        }
      } catch (error) {
        logger.error("Message receipt processing failed", {
          event,
          userId: socket.data.userId,
          deviceId: socket.data.deviceId,
          error: error.message
        });
        result = {
          success: false,
          serverMessageId: typeof payload?.serverMessageId === "string" ? payload.serverMessageId : null,
          errorCode: ErrorCodes.INVALID_MESSAGE,
          message: "Unable to update message receipt."
        };
      }
      if (typeof acknowledge === "function") {
        const { notification: _notification, ...acknowledgement } = result;
        acknowledge(acknowledgement);
      }
    });
  });
}

module.exports = { initializeMessaging, deviceRoom };
