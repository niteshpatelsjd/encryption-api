const CallSession = require("../models/CallSession");
const SocketEvents = require("../constants/SocketEvents");
const callPush = require("../services/CallPushService");
const logger = require("../utils/logger");

const intervalMs = Math.min(Math.max(Number(process.env.CALL_EXPIRY_POLL_MS) || 5000, 1000), 60000);
let timer;

async function expireCalls(io) {
  const candidates = await CallSession.find({
    status: "RINGING",
    expiresAt: { $lte: new Date() }
  }).select("_id conversationId participantUserIds").limit(100).lean();

  for (const candidate of candidates) {
    const expired = await CallSession.findOneAndUpdate(
      { _id: candidate._id, status: "RINGING", expiresAt: { $lte: new Date() } },
      { $set: { status: "EXPIRED", endedAt: new Date() } },
      { new: true }
    ).lean();
    if (!expired) continue;
    const userIds = expired.participantUserIds.map(String);
    const payload = {
      type: "CALL_EXPIRED", callId: String(expired._id),
      conversationId: String(expired.conversationId), state: "EXPIRED"
    };
    userIds.forEach(userId => io?.to(`user:${userId}`).emit(SocketEvents.CALL_EXPIRED, payload));
    void callPush.notifyState(userIds, payload).catch(error =>
      logger.warn("Expired call push failed", { callId: payload.callId, error: error.message }));
  }
}

function start(io) {
  if (timer) return;
  timer = setInterval(() => expireCalls(io).catch(error =>
    logger.error("Call expiry scan failed", { error: error.message })), intervalMs);
  timer.unref();
}

module.exports = { start, expireCalls };
