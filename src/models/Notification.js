const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      default: null,
      index: true,
    },
    dedupeKey: {
      type: String,
      default: null,
      select: false,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organizations",
      index: true,
      default: null,
      required: false
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["SYSTEM", "GENERAL", "EVENT", "ANNOUNCEMENT", "ALERT", "NEW_MESSAGE"],
      default: "GENERAL",
    },
    data: {
      type: Object,
      default: {},
    },
    imageUrl: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    sentStatus: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED"],
      default: "PENDING",
    },
    firebaseMessageId: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
    status: {
      type: Number,
      enum: [0, 1, 2],
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1,
});
NotificationSchema.index({
  userId: 1,
  isRead: 1,
  status: 1,
  createdAt: -1,
});
NotificationSchema.index({
  sentStatus: 1,
  status: 1,
  createdAt: 1,
});
NotificationSchema.index({
  type: 1,
  status: 1,
  createdAt: -1,
});

NotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("notification", NotificationSchema);
