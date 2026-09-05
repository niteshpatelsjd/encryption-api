const service = require("../services/MobileNotificationService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

const handle = handler => async (req, res) => {
  try {
    const result = await handler(req);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Mobile notification API error", { path: req.originalUrl, error: error.message, stack: error.stack });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
};

module.exports = {
  list: handle(req => service.list(req.user.userId, req.user.deviceId, req.query)),
  markRead: handle(req => service.markRead(req.user.userId, req.user.deviceId, req.params.id)),
  markAllRead: handle(req => service.markAllRead(req.user.userId, req.user.deviceId)),
  remove: handle(req => service.remove(req.user.userId, req.user.deviceId, req.params.id))
};
