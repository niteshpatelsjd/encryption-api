const test = require("node:test");
const assert = require("node:assert/strict");
const callService = require("../src/services/CallService");
const callPush = require("../src/services/CallPushService");
const controller = require("../src/controllers/CallController");

test("Firebase failure does not fail successful call creation", async t => {
  t.mock.method(callService, "start", async () => ({
    responseCode: 201,
    message: "Call started",
    responseBody: {
      callId: "call-id", conversationId: "conversation-id", mode: "audio"
    },
    notifyUserIds: ["recipient"],
    callerName: "Caller",
    callerProfileUrl: ""
  }));
  t.mock.method(callPush, "notify", async () => {
    throw Object.assign(new Error("Firebase unavailable"), { code: "messaging/internal-error" });
  });
  const req = {
    user: { userId: "caller", deviceId: "caller-device" },
    body: {},
    app: { get: () => null }
  };
  let statusCode;
  let body;
  const res = {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return value; }
  };
  await controller.start(req, res);
  assert.equal(statusCode, 201);
  assert.equal(body.responseCode, 201);
});
