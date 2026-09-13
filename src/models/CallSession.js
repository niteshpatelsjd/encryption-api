const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  livekitRoomName: { type: String, required: true, unique: true },
  initiatorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  participantUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "users", required: true }],
  mode: { type: String, enum: ["audio", "video"], required: true },
  status: { type: String, enum: ["RINGING", "ACTIVE", "DECLINED", "CANCELLED", "ENDED", "EXPIRED"], default: "RINGING", index: true },
  clientCallId: { type: String, trim: true, maxlength: 128, default: null },
  startedAt: Date,
  answeredAt: Date,
  endedAt: Date,
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true, collection: "call_sessions" });

schema.index({ participantUserIds: 1, status: 1, createdAt: -1 });
schema.index(
  { initiatorUserId: 1, clientCallId: 1 },
  { unique: true, partialFilterExpression: { clientCallId: { $type: "string" } } }
);

module.exports = mongoose.model("CallSession", schema);
