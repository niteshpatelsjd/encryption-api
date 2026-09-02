const mongoose = require("mongoose");

const ContentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["privacy_policy", "terms_conditions", "about_us"],
      required: true,
      unique: true,
    },
    content: { type: String, required: true },
    lang: { type: String, required: false },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Content", ContentSchema);
