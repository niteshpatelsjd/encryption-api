const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
  deviceId: { type: String, required: true, index: true },
  keyId: { type: Number, required: true },
  publicKey: { type: String, required: true },
  status: { type: String, enum: ["AVAILABLE", "CLAIMED"], default: "AVAILABLE", required: true },
  claimedAt: { type: Date, default: null },
  claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  claimedByDeviceId: { type: String, default: null }
}, { timestamps: true, collection: "device_one_time_prekeys" });

schema.index({ deviceId: 1, keyId: 1 }, { unique: true });
schema.index({ userId: 1, deviceId: 1, status: 1, keyId: 1 });

module.exports = mongoose.model("OneTimePrekey", schema);
