const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const ConversationMember = require("../models/ConversationMember");
const Device = require("../models/Device");

const failure = code => ({ success: false, errorCode: code, message: "Unable to update typing status." });

async function authorize({ conversationId, userId, deviceId }) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return failure("INVALID_TYPING_EVENT");
  const [conversation, member, device] = await Promise.all([
    Conversation.exists({ _id: conversationId, status: 1 }),
    ConversationMember.exists({ conversationId, userId, status: 1 }),
    Device.exists({ userId, deviceId, status: "ACTIVE" })
  ]);
  if (!device) return failure("DEVICE_REVOKED");
  if (!conversation || !member) return failure("UNAUTHORIZED_CONVERSATION");

  const recipients = await ConversationMember.find({
    conversationId,
    userId: { $ne: new mongoose.Types.ObjectId(userId) },
    status: 1
  }).select("userId").lean();
  return {
    success: true,
    conversationId: String(conversationId),
    recipientUserIds: [...new Set(recipients.map(record => String(record.userId)))]
  };
}

module.exports = { authorize };
