const mongoose = require("mongoose");

const RoleSchema = new mongoose.Schema(
  {

    roleName: { type: String, required: true },
    roleDescription: { type: String },

    // embedding roleModules or referencing them
    roleModuleList: [{ type: mongoose.Schema.Types.ObjectId, ref: "role_modules" }],

    status: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "roles" }
);

module.exports = mongoose.model("roles", RoleSchema);
