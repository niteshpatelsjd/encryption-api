const redis = require("../config/RedisConfig");
const { ACTIVATION_RATE_LIMIT, ACTIVATION_RATE_WINDOW_SECONDS } = require("../constants/SecurityConstants");

const memory = new Map();

function reject(res, retryAfterSeconds) {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  res.set("Retry-After", String(seconds));
  return res.status(429).json({
    responseCode: 429,
    message: "Too many activation attempts",
    responseBody: {
      code: "ACTIVATION_RATE_LIMITED",
      retryAfterSeconds: seconds,
      retryAt: new Date(Date.now() + seconds * 1000).toISOString()
    }
  });
}

module.exports = async function activationRateLimit(req, res, next) {
  const identity = req.ip || req.socket.remoteAddress || "unknown";
  const key = `activation_attempt:${identity}`;
  try {
    if (redis.status === "ready") {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, ACTIVATION_RATE_WINDOW_SECONDS);
      if (count > ACTIVATION_RATE_LIMIT) {
        const ttl = await redis.ttl(key);
        // Cap buckets created by older deployments that used a longer window.
        if (ttl > ACTIVATION_RATE_WINDOW_SECONDS) {
          await redis.expire(key, ACTIVATION_RATE_WINDOW_SECONDS);
        }
        return reject(
          res,
          ttl > 0 ? Math.min(ttl, ACTIVATION_RATE_WINDOW_SECONDS) : ACTIVATION_RATE_WINDOW_SECONDS
        );
      }
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
  if (entry.count > ACTIVATION_RATE_LIMIT) return reject(res, (entry.resetAt - now) / 1000);
  return next();
};
