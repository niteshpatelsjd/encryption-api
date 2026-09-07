const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  livekitRoomName: { type: String, required: true, unique: true },
  initiatorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  participantUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "users", required: true }],
  mode: { type: String, enum: ["audio", "video"], required: true },
  status: { type: String, enum: ["RINGING", "ACTIVE", "DECLINED", "ENDED"], default: "RINGING", index: true },
  startedAt: Date,
  answeredAt: Date,
  endedAt: Date
}, { timestamps: true, collection: "call_sessions" });

schema.index({ participantUserIds: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("CallSession", schema);
