const conversationService = require("../services/ConversationService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");
const SocketEvents = require("../constants/SocketEvents");

async function create(req, res) {
  try {
    const result = await conversationService.createDirect(req.user.userId, req.body);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Create conversation error", { error: error.message, stack: error.stack });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

async function list(req, res) {
  try {
    const result = await conversationService.list(req.user.userId, req.query);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("List conversations error", { error: error.message, stack: error.stack });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

async function remove(req, res) {
  try {
    const result = await conversationService.removeForUser(req.user.userId, req.params.conversationId);
    if (result.responseCode === 200 && Array.isArray(result.notifyUserIds)) {
      const io = req.app.get("io");
      if (io) {
        result.notifyUserIds.forEach(userId => io.to(`user:${userId}`).emit(
          SocketEvents.CONVERSATION_DELETED,
          { conversationId: req.params.conversationId }
        ));
      }
      delete result.notifyUserIds;
    }
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Delete conversation error", { userId: req.user?.userId, conversationId: req.params.conversationId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

module.exports = { create, list, remove };
