const mongoose = require("mongoose");
const redis = require("../config/RedisConfig");
const Device = require("../models/Device");
const SocketEvents = require("../constants/SocketEvents");

const MAX_SUBSCRIPTIONS = 100;
const localConnections = new Map();
const localLastSeen = new Map();
let presenceServer = null;

function setPresenceServer(io) { presenceServer = io; }

async function disconnectDevice(userId, deviceId) {
  if (!presenceServer) return;
  const sockets = await presenceServer.in(`user:${userId}`).fetchSockets();
  sockets.filter(socket => String(socket.data.deviceId) === String(deviceId))
    .forEach(socket => socket.disconnect(true));
}

function presenceRoom(userId) {
  return `presence:user:${userId}`;
}

function connectionKey(userId) {
  return `presence_connections:${userId}`;
}

function lastSeenKey(userId) {
  return `presence_last_seen:${userId}`;
}

function normalizeUserIds(payload) {
  if (!payload || !Array.isArray(payload.userIds)) return null;
  return [...new Set(payload.userIds.map(String))]
    .filter(userId => mongoose.Types.ObjectId.isValid(userId))
    .slice(0, MAX_SUBSCRIPTIONS);
}

async function addConnection(userId, socketId) {
  if (redis.status === "ready") {
    await redis.sadd(connectionKey(userId), socketId);
    await redis.del(lastSeenKey(userId));
    return redis.scard(connectionKey(userId));
  }

  const connections = localConnections.get(userId) || new Set();
  connections.add(socketId);
  localConnections.set(userId, connections);
  localLastSeen.delete(userId);
  return connections.size;
}

async function removeConnection(userId, socketId) {
  const lastSeenAt = new Date().toISOString();
  if (redis.status === "ready") {
    await redis.srem(connectionKey(userId), socketId);
    const remaining = await redis.scard(connectionKey(userId));
    if (remaining === 0) {
      await redis
        .multi()
        .del(connectionKey(userId))
        .set(lastSeenKey(userId), lastSeenAt)
        .exec();
    }
    return { remaining, lastSeenAt };
  }

  const connections = localConnections.get(userId) || new Set();
  connections.delete(socketId);
  if (connections.size === 0) {
    localConnections.delete(userId);
    localLastSeen.set(userId, lastSeenAt);
  } else {
    localConnections.set(userId, connections);
  }
  return { remaining: connections.size, lastSeenAt };
}

async function getPresence(userId) {
  // Redis socket IDs can outlive a crashed process. Only live adapter sockets
  // are authoritative; fetchSockets also supports a distributed adapter.
  const sockets = presenceServer ? await presenceServer.in(`user:${userId}`).fetchSockets() : [];
  const online = sockets.length > 0;
  const lastSeenAt = online ? null : (redis.status === "ready"
    ? await redis.get(lastSeenKey(userId)) : localLastSeen.get(userId) || null);
  return { userId, status: online ? "ONLINE" : "OFFLINE", lastSeenAt };
}

function initializePresence(io, socket) {
  const { userId, deviceId } = socket.data;
  socket.join(presenceRoom(userId));

  socket.on(SocketEvents.PRESENCE_SUBSCRIBE, async (payload, acknowledge) => {
    try {
      const userIds = normalizeUserIds(payload);
      if (!userIds) throw new Error("userIds must be an array");
      await Promise.all(userIds.map(id => socket.join(presenceRoom(id))));
      const presences = await Promise.all(userIds.map(getPresence));
      presences.forEach(presence => socket.emit(SocketEvents.PRESENCE_UPDATE, presence));
      if (typeof acknowledge === "function") acknowledge({ success: true, subscribedUserIds: userIds });
    } catch (_error) {
      const response = { success: false, code: "INVALID_PRESENCE_SUBSCRIPTION" };
      socket.emit(SocketEvents.PRESENCE_ERROR, response);
      if (typeof acknowledge === "function") acknowledge(response);
    }
  });

  socket.on(SocketEvents.PRESENCE_UNSUBSCRIBE, async (payload, acknowledge) => {
    const userIds = normalizeUserIds(payload);
    if (!userIds) {
      const response = { success: false, code: "INVALID_PRESENCE_SUBSCRIPTION" };
      if (typeof acknowledge === "function") acknowledge(response);
      return;
    }
    await Promise.all(
      userIds
        .filter(id => id !== userId)
        .map(id => socket.leave(presenceRoom(id)))
    );
    if (typeof acknowledge === "function") acknowledge({ success: true, unsubscribedUserIds: userIds });
  });

  addConnection(userId, socket.id)
    .then(() => {
      if (socket.connected) {
        io.to(presenceRoom(userId)).emit(SocketEvents.USER_ONLINE, {
          userId,
          timestamp: new Date().toISOString()
        });
      }
    })
    .catch(() => null);

  socket.on("disconnect", async () => {
    try {
      const { lastSeenAt } = await removeConnection(userId, socket.id);
      const current = await getPresence(userId);
      if (current.status === "OFFLINE") {
        io.to(presenceRoom(userId)).emit(SocketEvents.USER_OFFLINE, {
          userId,
          lastSeenAt
        });
      }
      await Device.updateOne(
        { userId, deviceId },
        { $set: { lastSeenAt: new Date(lastSeenAt) } }
      );
    } catch (_error) {
      // Presence cleanup must never crash the Socket.IO process.
    }
  });
}

module.exports = { initializePresence, getPresence, setPresenceServer, disconnectDevice };
