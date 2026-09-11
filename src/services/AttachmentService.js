const mongoose = require("mongoose");
const Attachment = require("../models/Attachment");
const ConversationMember = require("../models/ConversationMember");
const s3Util = require("../utils/s3Util");
const buildResponse = require("../utils/response");

const MAX_ENCRYPTED_BYTES = 200 * 1024 * 1024 + 16;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

async function member(conversationId, userId) {
  return ConversationMember.exists({ conversationId, userId, status: 1 });
}

async function initialize(userId, deviceId, body) {
  const conversationId = body?.conversationId;
  const encryptedSize = Number(body?.encryptedSize);
  const contentType = typeof body?.contentType === "string" ? body.contentType.trim().slice(0, 120) : "";
  const ciphertextHash = typeof body?.ciphertextHash === "string" ? body.ciphertextHash.trim().toLowerCase() : "";
  if (!mongoose.Types.ObjectId.isValid(conversationId) || !Number.isSafeInteger(encryptedSize) || encryptedSize <= 0 || encryptedSize > MAX_ENCRYPTED_BYTES || !contentType || !HASH_PATTERN.test(ciphertextHash)) {
    return buildResponse(400, "Invalid encrypted attachment metadata");
  }
  if (!(await member(conversationId, userId))) return buildResponse(403, "You are not a member of this conversation");
  const id = new mongoose.Types.ObjectId();
  const s3Key = `chat-attachments/${conversationId}/${id}.bin`;
  const attachment = await Attachment.create({
    _id: id, conversationId, uploaderUserId: userId, uploaderDeviceId: deviceId,
    s3Key, encryptedSize, contentType, ciphertextHash, encryptionVersion: "AES_256_GCM_V1",
    status: "PENDING", expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const uploadUrl = await s3Util.getPreSignedUploadUrl(s3Key, "application/octet-stream", 900);
  return buildResponse(201, "Encrypted attachment upload initialized", { attachmentId: String(attachment._id), uploadUrl, expiresIn: 900 });
}

async function complete(userId, deviceId, attachmentId) {
  if (!mongoose.Types.ObjectId.isValid(attachmentId)) return buildResponse(400, "Invalid attachmentId");
  const attachment = await Attachment.findOne({ _id: attachmentId, uploaderUserId: userId, uploaderDeviceId: deviceId });
  if (!attachment) return buildResponse(404, "Attachment not found");
  if (attachment.status === "READY") return buildResponse(200, "Encrypted attachment ready", { attachmentId: String(attachment._id) });
  const object = await s3Util.headFile(attachment.s3Key);
  if (!object || Number(object.ContentLength) !== attachment.encryptedSize) return buildResponse(409, "Encrypted attachment upload is incomplete");
  attachment.status = "READY";
  attachment.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await attachment.save();
  return buildResponse(200, "Encrypted attachment ready", { attachmentId: String(attachment._id) });
}

async function download(userId, attachmentId) {
  if (!mongoose.Types.ObjectId.isValid(attachmentId)) return buildResponse(400, "Invalid attachmentId");
  const attachment = await Attachment.findOne({ _id: attachmentId, status: "READY" }).lean();
  if (!attachment) return buildResponse(404, "Attachment not found");
  if (!(await member(attachment.conversationId, userId))) return buildResponse(403, "You are not a member of this conversation");
  const downloadUrl = await s3Util.getPreSignedUrl(attachment.s3Key, 900);
  return buildResponse(200, "Encrypted attachment download authorized", { downloadUrl, encryptedSize: attachment.encryptedSize, ciphertextHash: attachment.ciphertextHash, expiresIn: 900 });
}

async function remove(userId, deviceId, attachmentId) {
  if (!mongoose.Types.ObjectId.isValid(attachmentId)) return buildResponse(400, "Invalid attachmentId");
  const attachment = await Attachment.findOne({ _id: attachmentId, uploaderUserId: userId, uploaderDeviceId: deviceId, messageId: null });
  if (!attachment) return buildResponse(404, "Attachment not found");
  await s3Util.deleteFile(attachment.s3Key);
  await attachment.deleteOne();
  return buildResponse(200, "Encrypted attachment removed");
}

module.exports = { initialize, complete, download, remove, MAX_ENCRYPTED_BYTES };
