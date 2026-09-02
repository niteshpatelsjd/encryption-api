const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  codeHint: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
  status: { type: String, enum: ["PENDING", "ACTIVE", "EXPIRED", "USED", "REVOKED"], default: "ACTIVE", index: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date, default: null },
  usedByDeviceId: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "admin_user", default: null }
}, { timestamps: true, collection: "activation_codes" });

module.exports = mongoose.model("ActivationCode", schema);
