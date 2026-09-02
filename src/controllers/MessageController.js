const messagingService = require("../services/MessagingService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

async function sync(req, res) {
  try {
    const result = await messagingService.sync(req.user.userId, req.user.deviceId, req.query);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Message sync error", { userId: req.user?.userId, deviceId: req.user?.deviceId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

async function history(req, res) {
  try {
    const result = await messagingService.history(req.user.userId, req.user.deviceId, req.params.conversationId, req.query);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Message history error", { userId: req.user?.userId, conversationId: req.params.conversationId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

module.exports = { sync, history };
