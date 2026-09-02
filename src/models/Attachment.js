const mongoose = require("mongoose");
const schema = new mongoose.Schema({ messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true }, s3Key: { type: String, required: true }, encryptedSize: Number, contentType: String, encryptionVersion: { type: String, required: true }, ciphertextHash: { type: String, required: true } }, { timestamps: true, collection: "attachments" });
module.exports = mongoose.model("Attachment", schema);
