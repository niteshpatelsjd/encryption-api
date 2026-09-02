const { Queue } = require("bullmq");

function createQueue(name) {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required for BullMQ");
  return new Queue(name, { connection: { url: process.env.REDIS_URL } });
}

module.exports = { createQueue };
