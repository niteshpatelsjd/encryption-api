const mongoose = require("mongoose");
const schema = new mongoose.Schema({ conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true }, livekitRoomName: { type: String, required: true }, status: { type: String, enum: ["CREATED", "ACTIVE", "ENDED"], default: "CREATED" }, startedAt: Date, endedAt: Date }, { timestamps: true, collection: "call_sessions" });
module.exports = mongoose.model("CallSession", schema);
