const mongoose = require("mongoose");

const ModuleSchema = new mongoose.Schema(
  {
    
    // ======================================
    // Module Information
    // ======================================

    moduleName: {
      type: String,
      required: true,
      trim: true
    },

    parentModuleName: {
      type: String,
      trim: true,
      default: null
    },

    moduleCode: {
      type: String,
      required: true,
      trim: true
    },

    // ======================================
    // Permissions / Actions
    // ======================================

    moduleAction: {
      type: Number,
      default: 0
    },

    addAction: {
      type: Number,
      default: 0
    },

    updateAction: {
      type: Number,
      default: 0
    },

    deleteAction: {
      type: Number,
      default: 0
    },

    downloadAction: {
      type: Number,
      default: 0
    },

    viewAction: {
      type: Number,
      default: 0
    },

    // ======================================
    // Status
    // ======================================

    // 1 = Active
    // 0 = Inactive
    status: {
      type: Number,
      default: 1,
      index: true
    },

    // ======================================
    // Audit
    // ======================================

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
    collection: "modules"
  }
);

// ======================================
// Indexes
// ======================================





module.exports = mongoose.model("modules", ModuleSchema);