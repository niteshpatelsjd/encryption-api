const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    occupation: {
      type: String,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },

    password: {
      type: String,
      required: true
    },

    profileUrl: {
      type: String,
      trim: true
    },

    gender: {
      type: String,
      trim: true
    },

    profileImageKey: {
      type: String,
      default: null
    },

    countryCode: {
      type: String,
      trim: true
    },

    mobileNumber: {
      type: String,
      trim: true
    },

    deviceToken: {
      type: String,
      default: null
    },

    deviceType: {
      type: String,
      default: null
    },

    activeDeviceId: {
      type: String,
      default: null,
      index: true
    },


    isEmailVerified: {
      type: Boolean,
      default: false
    },

    profileCompleted: {
      type: Boolean,
      default: false
    },



    status: {
      type: Number,
      default: 1
    },

    // ======================================
    // Notification Settings
    // ======================================

    notificationEnable: {
      type: Boolean,
      default: true
    },

    alertNotification: {
      type: Boolean,
      default: true
    },

    announcementNotification: {
      type: Boolean,
      default: true
    },

    eventNotification: {
      type: Boolean,
      default: true
    },

    disappearingMessagesEnabled: {
      type: Boolean,
      default: false
    },

    lastLogin: {
      type: Date
    },

    createdAt: {
      type: Date,
      default: Date.now
    },

    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "users"
  }
);

UserSchema.index({ status: 1, _id: 1 });

module.exports = mongoose.model(
  "users",
  UserSchema
);
