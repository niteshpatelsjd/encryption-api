const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
  deviceId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: { type: Date, default: null },
  replacedByTokenHash: { type: String, default: null }
}, { timestamps: true, collection: "refresh_tokens" });

module.exports = mongoose.model("RefreshToken", schema);
