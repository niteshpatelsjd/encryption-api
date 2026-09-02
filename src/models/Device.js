const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
  deviceId: { type: String, required: true, trim: true },
  deviceType: { type: String, enum: ["ANDROID", "IOS"], required: true },
  deviceName: { type: String, trim: true, default: "" },
  identityKey: { type: String, required: true },
  identityKeyAlgorithm: { type: String, required: true, trim: true },
  registrationId: { type: Number, default: null },
  status: { type: String, enum: ["ACTIVE", "REVOKED"], default: "ACTIVE", index: true },
  lastSeenAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null }
}, { timestamps: true, collection: "devices" });

schema.index({ userId: 1, deviceId: 1 }, { unique: true });
module.exports = mongoose.model("Device", schema);
