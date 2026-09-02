const mongoose = require("mongoose");
const schema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null, index: true }, deviceId: { type: String, default: null }, type: { type: String, required: true, index: true }, outcome: { type: String, enum: ["SUCCESS", "FAILURE"], required: true }, ipAddress: String, metadata: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true, collection: "security_events" });
module.exports = mongoose.model("SecurityEvent", schema);
