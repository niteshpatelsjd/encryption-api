const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null, index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  uploaderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
  uploaderDeviceId: { type: String, required: true },
  s3Key: { type: String, required: true, unique: true },
  encryptedSize: { type: Number, required: true },
  contentType: { type: String, required: true },
  encryptionVersion: { type: String, enum: ["AES_256_GCM_V1"], required: true },
  ciphertextHash: { type: String, required: true },
  status: { type: String, enum: ["PENDING", "READY"], default: "PENDING", required: true, index: true },
  expiresAt: { type: Date, default: null }
}, { timestamps: true, collection: "attachments" });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: "date" } } });
module.exports = mongoose.model("Attachment", schema);