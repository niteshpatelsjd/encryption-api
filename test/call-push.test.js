const test = require("node:test");
const assert = require("node:assert/strict");
const Device = require("../src/models/Device");
const firebaseConfig = require("../src/config/FirebaseConfig");
const fcm = require("../src/services/FcmService");
const callPush = require("../src/services/CallPushService");

test("call invite is sent to every active recipient token as data-only strings", async t => {
  let deviceFilter;
  t.mock.method(Device, "find", value => {
    deviceFilter = value;
    return {
      select() { return this; },
      lean: async () => [
        { _id: "device-one", deviceId: "phone-one", pushToken: "token-one" },
        { _id: "device-two", deviceId: "phone-two", pushToken: "token-two" }
      ]
    };
  });
  const sends = [];
  t.mock.method(fcm, "sendDataOnly", async value => {
    sends.push(value);
    return { sentStatus: "SENT" };
  });

  await callPush.notify(["recipient-user"], {
    callId: 123,
    conversationId: 456,
    callerUserId: 789,
    callerName: "",
    callerProfileUrl: null,
    mode: "unexpected"
  });

  assert.deepEqual(deviceFilter, { userId: { $in: ["recipient-user"] }, status: "ACTIVE" });
  assert.equal(sends.length, 2);
  for (const send of sends) {
    assert.equal(send.ttlMs, 45000);
    assert.deepEqual(send.data, {
      type: "CALL_INVITE",
      callId: "123",
      conversationId: "456",
      callerUserId: "789",
      callerName: "A contact",
      callerProfileUrl: "",
      mode: "audio"
    });
    assert.equal(Object.values(send.data).every(value => typeof value === "string"), true);
    assert.equal("notification" in send, false);
    assert.equal(JSON.stringify(send).toLowerCase().includes("livekit"), false);
    assert.equal(JSON.stringify(send).toLowerCase().includes("secret"), false);
  }
});

test("FCM data-only sender omits notification block and applies short high-priority TTL", async t => {
  let firebaseMessage;
  t.mock.method(firebaseConfig, "getMessaging", () => ({
    send: async value => {
      firebaseMessage = value;
      return "firebase-message-id";
    }
  }));

  const result = await fcm.sendDataOnly({
    token: "recipient-token",
    data: { type: "CALL_INVITE", callId: 123, enabled: true },
    ttlMs: 45000
  });

  assert.equal(result.sentStatus, "SENT");
  assert.equal("notification" in firebaseMessage, false);
  assert.deepEqual(firebaseMessage.android, { priority: "high", ttl: 45000 });
  assert.deepEqual(firebaseMessage.data, {
    type: "CALL_INVITE",
    callId: "123",
    enabled: "true"
  });
});
