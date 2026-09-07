const callService = require("../services/CallService");
const SocketEvents = require("../constants/SocketEvents");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

function notify(req, userIds, event, payload) {
  const io = req.app.get("io");
  if (!io || !Array.isArray(userIds)) return;
  userIds.forEach(userId => io.to(`user:${userId}`).emit(event, payload));
}

async function start(req, res) {
  try {
    const result = await callService.start(req.user.userId, req.user.deviceId, req.body);
    if (result.responseCode === 201) notify(req, result.notifyUserIds, SocketEvents.CALL_INVITE, {
      callId: result.responseBody.callId, conversationId: result.responseBody.conversationId,
      callerUserId: String(req.user.userId), callerName: result.callerName, mode: result.responseBody.mode
    });
    delete result.notifyUserIds; delete result.callerName;
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Start call failed", { userId: req.user?.userId, error: error.message });
    return res.status(503).json(buildResponse(503, "Secure calling is temporarily unavailable"));
  }
}

async function respond(req, res) {
  try {
    const result = await callService.respond(req.user.userId, req.user.deviceId, req.params.callId, req.body);
    const event = req.body?.action === "accept" ? SocketEvents.CALL_ACCEPTED : SocketEvents.CALL_DECLINED;
    if (result.responseCode === 200) notify(req, result.notifyUserIds, event, { callId: req.params.callId });
    delete result.notifyUserIds;
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Respond to call failed", { userId: req.user?.userId, callId: req.params.callId, error: error.message });
    return res.status(500).json(buildResponse(500, "Unable to respond to call"));
  }
}

async function end(req, res) {
  try {
    const result = await callService.end(req.user.userId, req.params.callId);
    notify(req, result.notifyUserIds, SocketEvents.CALL_ENDED, { callId: req.params.callId });
    delete result.notifyUserIds;
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("End call failed", { userId: req.user?.userId, callId: req.params.callId, error: error.message });
    return res.status(500).json(buildResponse(500, "Unable to end call"));
  }
}

async function list(req, res) {
  try {
    const result = await callService.list(req.user.userId);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("List calls failed", { userId: req.user?.userId, error: error.message });
    return res.status(500).json(buildResponse(500, "Unable to load call history"));
  }
}

module.exports = { start, respond, end, list };
