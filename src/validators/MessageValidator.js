const mongoose = require("mongoose");
const { MESSAGE_TYPE_TEXT, ENCRYPTION_VERSION_SIGNAL_V1, CIPHERTEXT_TYPES, MAX_ENVELOPES, MAX_CIPHERTEXT_BYTES } = require("../constants/MessageConstants");
const ErrorCodes = require("../constants/MessageErrorCodes");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_TYPES = ["EDIT", "DELETE", "REACTION"];
const invalid = (errorCode = ErrorCodes.INVALID_MESSAGE) => ({ errorCode, message: "Unable to send message." });

function validateMessage(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return invalid();
  if (typeof payload.clientMessageId !== "string" || !UUID_PATTERN.test(payload.clientMessageId.trim())) return invalid();
  if (!mongoose.Types.ObjectId.isValid(payload.conversationId)) return invalid();
  if (payload.messageType !== MESSAGE_TYPE_TEXT) return invalid();
  if (payload.encryptionVersion !== ENCRYPTION_VERSION_SIGNAL_V1) return invalid();
  let action = null;
  if (payload.action !== undefined) {
    if (!payload.action || typeof payload.action !== "object" || Array.isArray(payload.action)) return invalid();
    if (!ACTION_TYPES.includes(payload.action.type) || typeof payload.action.targetMessageId !== "string" || !UUID_PATTERN.test(payload.action.targetMessageId.trim())) return invalid();
    action = { type: payload.action.type, targetMessageId: payload.action.targetMessageId.trim() };
  }
  if (!Array.isArray(payload.envelopes) || !payload.envelopes.length || payload.envelopes.length > MAX_ENVELOPES) return invalid();

  const targets = new Set();
  for (const envelope of payload.envelopes) {
    if (!mongoose.Types.ObjectId.isValid(envelope?.recipientUserId)) return invalid(ErrorCodes.INVALID_RECIPIENT);
    if (typeof envelope.recipientDeviceId !== "string" || !envelope.recipientDeviceId.trim()) return invalid(ErrorCodes.INVALID_RECIPIENT);
    if (typeof envelope.ciphertext !== "string" || !envelope.ciphertext.trim().length) return invalid();
    if (Buffer.byteLength(envelope.ciphertext, "utf8") > MAX_CIPHERTEXT_BYTES) return invalid(ErrorCodes.MESSAGE_TOO_LARGE);
    if (!CIPHERTEXT_TYPES.includes(envelope.ciphertextType)) return invalid();
    const target = `${envelope.recipientUserId}:${envelope.recipientDeviceId}`;
    if (targets.has(target)) return invalid(ErrorCodes.INVALID_RECIPIENT);
    targets.add(target);
  }

  let clientCreatedAt = null;
  if (payload.createdAt !== undefined) {
    clientCreatedAt = new Date(payload.createdAt);
    if (Number.isNaN(clientCreatedAt.getTime())) return invalid();
  }
  return { value: {
    clientMessageId: payload.clientMessageId.trim(),
    conversationId: String(payload.conversationId),
    messageType: payload.messageType,
    encryptionVersion: payload.encryptionVersion,
    envelopes: payload.envelopes.map(envelope => ({
      recipientUserId: String(envelope.recipientUserId),
      recipientDeviceId: envelope.recipientDeviceId.trim(),
      ciphertext: envelope.ciphertext,
      ciphertextType: envelope.ciphertextType
    })),
    clientCreatedAt,
    action
  } };
}

module.exports = { validateMessage };
