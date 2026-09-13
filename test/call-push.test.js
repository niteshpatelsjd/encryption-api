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
        { _id: "device-one", deviceId: "phone-one", deviceType: "ANDROID", pushToken: "token-one" },
        { _id: "device-two", deviceId: "phone-two", deviceType: "ANDROID", pushToken: "token-two" }
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

  assert.deepEqual(deviceFilter, {
    userId: { $in: ["recipient-user"] },
    status: "ACTIVE",
    pushToken: { $type: "string", $ne: "" }
  });
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

test("iOS call invite uses an APNs alert while preserving the string data contract", async t => {
  t.mock.method(Device, "find", () => ({
    select() { return this; },
    lean: async () => [{
      _id: "ios-record", userId: "recipient-user", deviceId: "iphone",
      deviceType: "IOS", pushToken: "ios-token"
    }]
  }));
  let sent;
  t.mock.method(fcm, "sendIosCallAlert", async value => {
    sent = value;
    return { sentStatus: "SENT" };
  });
  await callPush.notify(["recipient-user"], {
    callId: "call-id", conversationId: "conversation-id", callerUserId: "caller-id",
    callerName: "Rahul", callerProfileUrl: "https://cdn.example/rahul.jpg", mode: "video"
  });
  assert.equal(sent.token, "ios-token");
  assert.equal(sent.callerName, "Rahul");
  assert.deepEqual(sent.data, {
    type: "CALL_INVITE", callId: "call-id", conversationId: "conversation-id",
    callerUserId: "caller-id", callerName: "Rahul",
    callerProfileUrl: "https://cdn.example/rahul.jpg", mode: "video"
  });
});

test("iOS Firebase payload supports lock-screen and terminated-app alert delivery", async t => {
  let firebaseMessage;
  t.mock.method(firebaseConfig, "getMessaging", () => ({
    send: async value => { firebaseMessage = value; return "ios-message-id"; }
  }));
  await fcm.sendIosCallAlert({
    token: "ios-token",
    data: callPush.inviteData({
      callId: "call-id", conversationId: "conversation-id", callerUserId: "caller-id",
      callerName: "Rahul", callerProfileUrl: null, mode: "audio"
    }),
    callerName: "Rahul", mode: "audio", callId: "call-id"
  });
  assert.equal("notification" in firebaseMessage, false);
  assert.equal(firebaseMessage.apns.headers["apns-priority"], "10");
  assert.equal(firebaseMessage.apns.headers["apns-push-type"], "alert");
  assert.deepEqual(firebaseMessage.apns.payload.aps.alert, {
    title: "Rahul", body: "Incoming secure audio call"
  });
  assert.equal(firebaseMessage.apns.payload.aps.category, "INCOMING_SECURE_CALL");
  assert.equal(firebaseMessage.apns.payload.aps.contentAvailable, true);
  assert.equal(firebaseMessage.apns.payload.aps.interruptionLevel, "time-sensitive");
  assert.equal(firebaseMessage.apns.payload.aps.threadId, "call-call-id");
  assert.equal(firebaseMessage.data.callerProfileUrl, "");
  assert.equal(Object.values(firebaseMessage.data).every(value => typeof value === "string"), true);
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

test("invalid iOS push token cleanup changes only the matching device token", async t => {
  t.mock.method(Device, "find", () => ({
    select() { return this; },
    lean: async () => [{
      _id: "ios-record", userId: "recipient", deviceId: "iphone",
      deviceType: "IOS", pushToken: "invalid-token"
    }]
  }));
  t.mock.method(fcm, "sendIosCallAlert", async () => ({
    sentStatus: "FAILED",
    errorCode: "messaging/registration-token-not-registered"
  }));
  let update;
  t.mock.method(Device, "updateOne", async (...args) => { update = args; });
  await callPush.notify(["recipient"], {
    callId: "call", conversationId: "conversation", callerUserId: "caller", mode: "audio"
  });
  assert.deepEqual(update[0], { _id: "ios-record", pushToken: "invalid-token" });
  assert.deepEqual(update[1].$unset, {
    pushToken: 1, pushPlatform: 1, pushTokenUpdatedAt: 1
  });
});
