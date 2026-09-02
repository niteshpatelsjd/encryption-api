const Redis = require("ioredis");
const client = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
client.on("connect", () => console.log("Redis connected"));
client.on("error", (e) => console.error("Redis error", e.message));
module.exports = client;
