const mongoose = require("mongoose");

const EnvelopeSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  recipientDeviceId: { type: String, required: true },
  ciphertext: { type: String, required: true },
  ciphertextType: { type: String, enum: ["PREKEY", "SIGNAL"], required: true },
  status: { type: String, enum: ["SENT", "DELIVERED", "READ"], default: "SENT", required: true },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null }
}, { _id: false });

const MessageActionSchema = new mongoose.Schema({
  type: { type: String, enum: ["EDIT", "DELETE", "REACTION"], required: true },
  targetMessageId: { type: String, required: true }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  clientMessageId: { type: String, required: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  senderDeviceId: { type: String, required: true },
  messageType: { type: String, enum: ["TEXT"], required: true },
  encryptionVersion: { type: String, enum: ["SIGNAL_V1"], required: true },
  action: { type: MessageActionSchema, default: null },
  envelopes: {
    type: [EnvelopeSchema],
    required: true,
    validate: {
      validator: envelopes => Array.isArray(envelopes) && envelopes.length > 0,
      message: "At least one encrypted envelope is required"
    }
  },
  clientCreatedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null }
}, { timestamps: true, collection: "messages" });

MessageSchema.index(
  { senderUserId: 1, senderDeviceId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: "string" } } }
);
MessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
MessageSchema.index({ "envelopes.recipientUserId": 1, "envelopes.recipientDeviceId": 1, "envelopes.status": 1 });
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Message", MessageSchema);
