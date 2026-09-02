const mongoose = require("mongoose");

const ConversationMemberSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ["MEMBER", "ADMIN"],
      default: "MEMBER"
    },
    joinedAt: { type: Date, default: Date.now },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastReadAt: { type: Date, default: null },
    archived: { type: Boolean, default: false },
    muted: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    status: { type: Number, enum: [0, 1], default: 1 }
  },
  { timestamps: true, collection: "conversation_members" }
);

ConversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
ConversationMemberSchema.index({ userId: 1, status: 1, conversationId: 1 });

module.exports = mongoose.model("ConversationMember", ConversationMemberSchema);
