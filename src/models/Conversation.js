const mongoose = require("mongoose");

const ConversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["DIRECT", "GROUP"],
      default: "DIRECT",
      required: true,
      index: true
    },
    participantIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
      required: true,
      validate: {
        validator(participants) {
          if (this.type !== "DIRECT") return participants.length > 0;
          return participants.length === 2 && new Set(participants.map(String)).size === 2;
        },
        message: "A direct conversation requires exactly two unique participants"
      }
    },
    directConversationKey: {
      type: String,
      default: null,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true
    },
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastMessageAt: {
      type: Date,
      default: null
    },
    activityAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    status: {
      type: Number,
      enum: [0, 1],
      default: 1,
      index: true
    }
  },
  { timestamps: true, collection: "conversations" }
);

ConversationSchema.index(
  { type: 1, directConversationKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "DIRECT",
      directConversationKey: { $type: "string" }
    }
  }
);
ConversationSchema.index({ participantIds: 1, status: 1, activityAt: -1, _id: -1 });

module.exports = mongoose.model("Conversation", ConversationSchema);
