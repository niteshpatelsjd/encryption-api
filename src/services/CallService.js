const crypto = require("crypto");
const mongoose = require("mongoose");
const { AccessToken } = require("livekit-server-sdk");
const CallSession = require("../models/CallSession");
const ConversationMember = require("../models/ConversationMember");
const User = require("../models/User");
const buildResponse = require("../utils/response");

const activeStatuses = ["RINGING", "ACTIVE"];

function liveKitConfig() {
  const url = process.env.LIVEKIT_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) throw new Error("LiveKit server configuration is incomplete");
  return { url, apiKey, apiSecret };
}

async function participantToken(call, userId, deviceId, name) {
  const { url, apiKey, apiSecret } = liveKitConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `${userId}:${deviceId}`,
    name: name || "Encryption App user",
    metadata: JSON.stringify({ callId: String(call._id), userId: String(userId), deviceId }),
    ttl: "10m"
  });
  token.addGrant({
    room: call.livekitRoomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources: call.mode === "video" ? ["microphone", "camera"] : ["microphone"]
  });
  const clientUrl = url.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  return { token: await token.toJwt(), serverUrl: clientUrl };
}

async function memberIds(conversationId) {
  return (await ConversationMember.find({ conversationId, status: 1 }).select("userId").lean()).map(member => String(member.userId));
}

async function start(userId, deviceId, body) {
  const { conversationId, recipientUserId, mode } = body || {};
  if (!mongoose.isValidObjectId(conversationId) || !mongoose.isValidObjectId(recipientUserId) ||
      !["audio", "video"].includes(mode) || String(userId) === String(recipientUserId)) {
    return buildResponse(400, "Invalid call request");
  }
  const members = await memberIds(conversationId);
  if (!members.includes(String(userId)) || !members.includes(String(recipientUserId))) {
    return buildResponse(403, "Call participants must belong to the conversation");
  }
  await CallSession.updateMany({ initiatorUserId: userId, status: { $in: activeStatuses } },
    { $set: { status: "ENDED", endedAt: new Date() } });
  const call = await CallSession.create({
    conversationId,
    livekitRoomName: `call-${crypto.randomUUID()}`,
    initiatorUserId: userId,
    participantUserIds: [userId, recipientUserId],
    mode,
    status: "RINGING",
    startedAt: new Date()
  });
  const caller = await User.findById(userId).select("name").lean();
  const credentials = await participantToken(call, userId, deviceId, caller?.name);
  return Object.assign(buildResponse(201, "Call started", {
    callId: String(call._id), conversationId: String(call.conversationId), roomName: call.livekitRoomName,
    mode: call.mode, ...credentials
  }), { notifyUserIds: [String(recipientUserId)], callerName: caller?.name || "Encryption App user" });
}

async function respond(userId, deviceId, callId, body) {
  if (!mongoose.isValidObjectId(callId) || !["accept", "decline"].includes(body?.action)) {
    return buildResponse(400, "Invalid call response");
  }
  const call = await CallSession.findOne({ _id: callId, participantUserIds: userId, status: "RINGING" });
  if (!call || String(call.initiatorUserId) === String(userId)) return buildResponse(404, "Call is no longer available");
  if (body.action === "decline") {
    call.status = "DECLINED"; call.endedAt = new Date(); await call.save();
    return Object.assign(buildResponse(200, "Call declined", { callId: String(call._id) }),
      { notifyUserIds: [String(call.initiatorUserId)] });
  }
  call.status = "ACTIVE"; call.answeredAt = new Date(); await call.save();
  const user = await User.findById(userId).select("name").lean();
  const credentials = await participantToken(call, userId, deviceId, user?.name);
  return Object.assign(buildResponse(200, "Call accepted", {
    callId: String(call._id), conversationId: String(call.conversationId), roomName: call.livekitRoomName,
    mode: call.mode, ...credentials
  }), { notifyUserIds: [String(call.initiatorUserId)] });
}

async function end(userId, callId) {
  if (!mongoose.isValidObjectId(callId)) return buildResponse(400, "Invalid callId");
  const call = await CallSession.findOneAndUpdate(
    { _id: callId, participantUserIds: userId, status: { $in: activeStatuses } },
    { $set: { status: "ENDED", endedAt: new Date() } }, { new: true }
  ).lean();
  if (!call) return buildResponse(200, "Call already ended", { callId });
  return Object.assign(buildResponse(200, "Call ended", { callId: String(call._id) }), {
    notifyUserIds: call.participantUserIds.map(String).filter(id => id !== String(userId))
  });
}

async function list(userId) {
  const calls = await CallSession.find({ participantUserIds: userId })
    .sort({ createdAt: -1 }).limit(50).lean();
  const peerIds = [...new Set(calls.flatMap(call => call.participantUserIds.map(String)))]
    .filter(id => id !== String(userId));
  const users = await User.find({ _id: { $in: peerIds } }).select("name profileUrl").lean();
  const usersById = new Map(users.map(user => [String(user._id), user]));
  return buildResponse(200, "Call history fetched", calls.map(call => {
    const peerUserId = call.participantUserIds.map(String).find(id => id !== String(userId)) || "";
    const peer = usersById.get(peerUserId);
    return {
      callId: String(call._id), conversationId: String(call.conversationId), peerUserId,
      peerName: peer?.name || "Encryption App user", peerProfileUrl: peer?.profileUrl || null,
      mode: call.mode, direction: String(call.initiatorUserId) === String(userId) ? "outgoing" : "incoming",
      status: call.status, startedAt: call.startedAt || call.createdAt, answeredAt: call.answeredAt || null,
      endedAt: call.endedAt || null
    };
  }));
}

module.exports = { start, respond, end, list };
