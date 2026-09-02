const Conversation = require("../models/Conversation");
const ConversationMember = require("../models/ConversationMember");
const Device = require("../models/Device");
const User = require("../models/User");
const messageRepo = require("../repositories/MessageRepository");
const { validateMessage } = require("../validators/MessageValidator");
const { parseQuery } = require("../validators/MessageQueryValidator");
const logger = require("../utils/logger");
const buildResponse = require("../utils/response");
const mongoose = require("mongoose");
const ErrorCodes = require("../constants/MessageErrorCodes");
const SocketEvents = require("../constants/SocketEvents");
const conversationRepo = require("../repositories/ConversationRepository");
const DISAPPEARING_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

const failure = (clientMessageId, errorCode = ErrorCodes.INVALID_MESSAGE) => ({
  success: false,
  clientMessageId: typeof clientMessageId === "string" ? clientMessageId : null,
  errorCode,
  message: "Unable to send message."
});

async function authorize(senderUserId, senderDeviceId, message) {
  const [activeUser, activeDevice, conversation, senderMember] = await Promise.all([
    User.exists({ _id: senderUserId, status: 1 }),
    Device.exists({ userId: senderUserId, deviceId: senderDeviceId, status: "ACTIVE" }),
    Conversation.findOne({ _id: message.conversationId, status: 1 }).select("_id").lean(),
    ConversationMember.exists({ conversationId: message.conversationId, userId: senderUserId, status: 1 })
  ]);
  if (!activeUser || !activeDevice) return ErrorCodes.DEVICE_REVOKED;
  if (!conversation || !senderMember) return ErrorCodes.UNAUTHORIZED_MESSAGE_ACCESS;

  const recipientUserIds = [...new Set(message.envelopes.map(envelope => envelope.recipientUserId))];
  const memberCount = await ConversationMember.countDocuments({
    conversationId: message.conversationId,
    userId: { $in: recipientUserIds },
    status: 1
  });
  if (memberCount !== recipientUserIds.length) return ErrorCodes.INVALID_RECIPIENT;

  const devices = await Device.find({
    status: "ACTIVE",
    $or: message.envelopes.map(envelope => ({
      userId: envelope.recipientUserId,
      deviceId: envelope.recipientDeviceId
    }))
  }).select("userId deviceId").lean();
  const activeTargets = new Set(devices.map(device => `${device.userId}:${device.deviceId}`));
  if (message.envelopes.some(envelope => !activeTargets.has(`${envelope.recipientUserId}:${envelope.recipientDeviceId}`))) {
    return ErrorCodes.DEVICE_NOT_FOUND;
  }
  return null;
}

function deliveryPayloads(message) {
  return message.envelopes.map(envelope => ({
    recipientUserId: String(envelope.recipientUserId),
    recipientDeviceId: envelope.recipientDeviceId,
    payload: {
      serverMessageId: String(message._id),
      clientMessageId: message.clientMessageId,
      conversationId: String(message.conversationId),
      senderUserId: String(message.senderUserId),
      senderDeviceId: message.senderDeviceId,
      recipientDeviceId: envelope.recipientDeviceId,
      messageType: message.messageType,
      encryptionVersion: message.encryptionVersion,
      action: message.action || null,
      ciphertext: envelope.ciphertext,
      ciphertextType: envelope.ciphertextType,
      createdAt: message.createdAt.toISOString(),
      expiresAt: message.expiresAt?.toISOString?.() || null
    }
  }));
}

async function send({ senderUserId, senderDeviceId, payload }) {
  const validation = validateMessage(payload);
  if (validation.errorCode) return failure(payload?.clientMessageId, validation.errorCode);
  const messageData = validation.value;
  const authorizationError = await authorize(senderUserId, senderDeviceId, messageData);
  if (authorizationError) return failure(messageData.clientMessageId, authorizationError);

  let actionTarget = null;
  if (messageData.action) {
    actionTarget = await messageRepo.findActionTarget(messageData.conversationId, messageData.action.targetMessageId);
    if (!actionTarget) return failure(messageData.clientMessageId, ErrorCodes.MESSAGE_NOT_FOUND);
    if (["EDIT", "DELETE"].includes(messageData.action.type) && String(actionTarget.senderUserId) !== String(senderUserId)) {
      return failure(messageData.clientMessageId, ErrorCodes.UNAUTHORIZED_MESSAGE_ACCESS);
    }
  }

  const senderPreference = await User.findById(senderUserId)
    .select("disappearingMessagesEnabled")
    .lean();
  const expiresAt = actionTarget
    ? actionTarget.expiresAt || null
    : senderPreference?.disappearingMessagesEnabled
    ? new Date(Date.now() + DISAPPEARING_MESSAGE_TTL_MS)
    : null;

  const result = await messageRepo.createIdempotent({
    ...messageData,
    senderUserId,
    senderDeviceId,
    expiresAt
  });
  if (result.created) {
    await conversationRepo.restoreForUsers(result.message.conversationId, [
      senderUserId,
      ...new Set(messageData.envelopes.map(envelope => envelope.recipientUserId))
    ]);
  }
  if (!messageData.action) await messageRepo.updateConversationActivity(result.message);

  logger.info("Encrypted message accepted", {
    serverMessageId: result.message._id,
    conversationId: result.message.conversationId,
    duplicate: !result.created
  });
  return {
    success: true,
    serverMessageId: String(result.message._id),
    clientMessageId: result.message.clientMessageId,
    createdAt: result.message.createdAt.toISOString(),
    expiresAt: result.message.expiresAt?.toISOString?.() || null,
    deliveries: result.created ? deliveryPayloads(result.message) : []
  };
}

function encodeCursor(message) {
  return Buffer.from(JSON.stringify({
    createdAt: new Date(message.createdAt).toISOString(),
    id: String(message._id)
  })).toString("base64url");
}

function serializeMessage(message) {
  return {
    serverMessageId: message._id,
    clientMessageId: message.clientMessageId,
    conversationId: message.conversationId,
    senderUserId: message.senderUserId,
    senderDeviceId: message.senderDeviceId,
    messageType: message.messageType,
    encryptionVersion: message.encryptionVersion,
    action: message.action || null,
    envelope: message.envelopes?.[0] || null,
    createdAt: message.createdAt,
    expiresAt: message.expiresAt || null
  };
}

async function sync(userId, deviceId, query) {
  const parsed = parseQuery(query, "sync");
  if (parsed.invalidCursor) return buildResponse(400, "Invalid message cursor");
  const records = await messageRepo.syncForDevice({ userId, deviceId, limit: parsed.limit, cursor: parsed.cursor });
  const hasMore = records.length > parsed.limit;
  if (hasMore) records.pop();
  const last = records[records.length - 1];
  return buildResponse(200, "Pending encrypted messages fetched successfully", {
    messages: records.map(serializeMessage),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    hasMore
  });
}

async function history(userId, deviceId, conversationId, query) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return buildResponse(400, "Invalid conversationId");
  const member = await ConversationMember.exists({ conversationId, userId, status: 1 });
  if (!member) return buildResponse(403, "You are not a member of this conversation");
  const parsed = parseQuery(query, "history");
  if (parsed.invalidCursor) return buildResponse(400, "Invalid message cursor");
  const records = await messageRepo.historyForDevice({ conversationId, userId, deviceId, limit: parsed.limit, cursor: parsed.cursor });
  const hasMore = records.length > parsed.limit;
  if (hasMore) records.pop();
  const last = records[records.length - 1];
  return buildResponse(200, "Encrypted message history fetched successfully", {
    messages: records.map(serializeMessage),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    hasMore
  });
}

function findRecipientEnvelope(message, userId, deviceId) {
  return message.envelopes?.find(envelope =>
    String(envelope.recipientUserId) === String(userId) && envelope.recipientDeviceId === deviceId
  );
}

async function receipt({ userId, deviceId, payload, receiptType }) {
  const serverMessageId = payload?.serverMessageId;
  if (!mongoose.Types.ObjectId.isValid(serverMessageId)) return failure(null, ErrorCodes.MESSAGE_NOT_FOUND);
  const context = await messageRepo.findReceiptContext(serverMessageId);
  if (!context) return failure(null, ErrorCodes.MESSAGE_NOT_FOUND);
  const envelope = findRecipientEnvelope(context, userId, deviceId);
  if (!envelope) return failure(null, ErrorCodes.UNAUTHORIZED_MESSAGE_ACCESS);
  const [activeDevice, member] = await Promise.all([
    Device.exists({ userId, deviceId, status: "ACTIVE" }),
    ConversationMember.exists({ conversationId: context.conversationId, userId, status: 1 })
  ]);
  if (!activeDevice) return failure(null, ErrorCodes.DEVICE_REVOKED);
  if (!member) return failure(null, ErrorCodes.UNAUTHORIZED_MESSAGE_ACCESS);

  const alreadyApplied = receiptType === "READ"
    ? envelope.status === "READ"
    : ["DELIVERED", "READ"].includes(envelope.status);
  let updatedMessage = context;
  let updated = false;
  if (!alreadyApplied) {
    const result = await messageRepo.updateReceipt(serverMessageId, userId, deviceId, receiptType);
    updated = result.updated;
    updatedMessage = result.message || await messageRepo.findReceiptContext(serverMessageId);
  }
  const updatedEnvelope = findRecipientEnvelope(updatedMessage, userId, deviceId);
  if (receiptType === "READ") {
    await conversationRepo.markRead({ conversationId: context.conversationId, userId, messageId: context._id, readAt: context.createdAt });
  }
  const timestampField = receiptType === "READ" ? "readAt" : "deliveredAt";
  const timestamp = updatedEnvelope?.[timestampField];
  logger.info("Message receipt accepted", { serverMessageId, event: `MESSAGE_${receiptType}`, updated });
  return {
    success: true,
    serverMessageId: String(serverMessageId),
    status: updatedEnvelope?.status,
    [timestampField]: timestamp?.toISOString?.() || timestamp,
    notification: updated ? {
      senderUserId: String(context.senderUserId),
      event: receiptType === "READ" ? SocketEvents.MESSAGE_READ : SocketEvents.MESSAGE_DELIVERED,
      payload: {
        serverMessageId: String(serverMessageId),
        recipientUserId: String(userId),
        recipientDeviceId: deviceId,
        [timestampField]: timestamp?.toISOString?.() || timestamp
      }
    } : null
  };
}

module.exports = { send, sync, history, receipt };
