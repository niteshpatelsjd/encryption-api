const service = require("../services/AttachmentService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

const handle = action => async (req, res) => {
  try {
    const result = await action(req);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Encrypted attachment request failed", { userId: req.user?.userId, deviceId: req.user?.deviceId, error: error.message });
    return res.status(500).json(buildResponse(500, "Unable to process encrypted attachment"));
  }
};

module.exports = {
  initialize: handle(req => service.initialize(req.user.userId, req.user.deviceId, req.body)),
  complete: handle(req => service.complete(req.user.userId, req.user.deviceId, req.params.attachmentId)),
  download: handle(req => service.download(req.user.userId, req.params.attachmentId)),
  remove: handle(req => service.remove(req.user.userId, req.user.deviceId, req.params.attachmentId))
};