const redis = require("../config/RedisConfig");
const { ACTIVATION_RATE_LIMIT, ACTIVATION_RATE_WINDOW_SECONDS } = require("../constants/SecurityConstants");

const memory = new Map();

module.exports = async function activationRateLimit(req, res, next) {
  const identity = req.ip || req.socket.remoteAddress || "unknown";
  const key = `activation_attempt:${identity}`;
  try {
    if (redis.status === "ready") {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ACTIVATION_RATE_WINDOW_SECONDS);
      if (count > ACTIVATION_RATE_LIMIT) return res.status(429).json({ responseCode: 429, message: "Too many activation attempts", responseBody: null });
      return next();
    }
  } catch (_error) {
    // Use the local limiter when Redis is temporarily unavailable.
  }

  const now = Date.now();
  const current = memory.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + ACTIVATION_RATE_WINDOW_SECONDS * 1000 }
    : { ...current, count: current.count + 1 };
  memory.set(key, entry);
  if (entry.count > ACTIVATION_RATE_LIMIT) return res.status(429).json({ responseCode: 429, message: "Too many activation attempts", responseBody: null });
  return next();
};
