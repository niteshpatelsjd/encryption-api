const mongoose = require("mongoose");

const UserSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminUser",
      index: true,
    },

    deviceType: String,
    deviceToken: String,

    sessionToken: {
      type: String,
      index: true,
    },

    loginAt: Date,
    logoutAt: Date,

    isActive: {
      type: Boolean,
      default: false,
    },

    // 🔹 NEW FIELDS
    eventType: {
      type: String,
      enum: ["LOGIN_SUCCESS", "LOGOUT", "LOGIN_FAILED"],
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    ipAddress: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserSession", UserSessionSchema);
