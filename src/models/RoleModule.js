const mongoose = require("mongoose");

const RoleModuleSchema = new mongoose.Schema(
  {
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "roles", required: true },
    moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "modules", required: true },
  
    moduleAction: { type: Number, default: 0 },
    moduleName: { type: String },
    parentModuleName: { type: String },
    moduleCode: { type: String },

    addAction: { type: Number, default: 0 },
    updateAction: { type: Number, default: 0 },
    deleteAction: { type: Number, default: 0 },
    downloadAction: { type: Number, default: 0 },
    viewAction: { type: Number, default: 0 },

    status: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "role_modules" }
);

module.exports = mongoose.model("role_modules", RoleModuleSchema);
