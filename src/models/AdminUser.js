const mongoose = require("mongoose");
const AdminUserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "roles",
      default: null
    },
    countryCode: { type: String, trim: true },
    password: String,
    mobileNumber: { type: String, unique: true, required: true },
    address: String,
    city: String,
    country: String,

    profileUrl: { type: String, trim: true },
    profileImageKey: { type: String, default: null },
    deviceType: { type: String, default: null },
    deviceToken: { type: String, default: null },
    lastLogin: { type: Date, default: null },
    status: { type: Number, default: 0 },
    profileCompleted: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "admin_users" }
);
module.exports = mongoose.model("admin_user", AdminUserSchema);
