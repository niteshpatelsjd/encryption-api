const User = require("../models/User");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

const preferenceBody = user => ({
  disappearingMessagesEnabled: user?.disappearingMessagesEnabled === true,
  disappearingMessageDurationSeconds: 24 * 60 * 60
});

async function get(req, res) {
  try {
    const user = await User.findById(req.user.userId).select("disappearingMessagesEnabled").lean();
    if (!user) return res.status(404).json(buildResponse(404, "User not found"));
    return res.json(buildResponse(200, "Preferences fetched successfully", preferenceBody(user)));
  } catch (error) {
    logger.error("User preference fetch failed", { userId: req.user?.userId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

async function updateDisappearingMessages(req, res) {
  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json(buildResponse(400, "enabled must be a boolean"));
  }
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user.userId, status: 1 },
      { $set: { disappearingMessagesEnabled: req.body.enabled, updatedAt: new Date() } },
      { new: true }
    ).select("disappearingMessagesEnabled").lean();
    if (!user) return res.status(404).json(buildResponse(404, "User not found"));
    return res.json(buildResponse(200, "Disappearing message preference updated successfully", preferenceBody(user)));
  } catch (error) {
    logger.error("User preference update failed", { userId: req.user?.userId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

module.exports = { get, updateDisappearingMessages };
