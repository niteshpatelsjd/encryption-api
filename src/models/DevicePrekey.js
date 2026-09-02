const mongoose = require("mongoose");

const publicKeySchema = new mongoose.Schema({
  keyId: { type: Number, required: true },
  publicKey: { type: String, required: true }
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
  deviceId: { type: String, required: true, index: true },
  signedPrekey: { type: publicKeySchema, required: true },
  signedPrekeySignature: { type: String, required: true }
}, { timestamps: true, collection: "device_prekeys" });

schema.index({ userId: 1, deviceId: 1 }, { unique: true });
module.exports = mongoose.model("DevicePrekey", schema);
