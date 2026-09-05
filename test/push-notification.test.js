const test = require("node:test");
const assert = require("node:assert/strict");
const Device = require("../src/models/Device");
const fcm = require("../src/services/FcmService");
const push = require("../src/services/EncryptedMessagePushService");
const notifications = require("../src/services/MobileNotificationService");

test("encrypted chat push is device-scoped and never contains plaintext or ciphertext", async t => {
  t.mock.method(Device, "find", () => ({ select() { return this; }, lean: async () => [{
    _id: "device-record", userId: "507f1f77bcf86cd799439011", deviceId: "device-a", pushToken: "fcm-token"
  }] }));
  let sent;
  let persisted;
  t.mock.method(notifications, "upsertEncryptedMessage", async value => { persisted = value; return { _id: "notification-a" }; });
  t.mock.method(notifications, "recordDelivery", async () => undefined);
  t.mock.method(fcm, "sendNotification", async value => { sent = value; return { sentStatus: "SENT" }; });
  await push.notify([{
    recipientUserId: "507f1f77bcf86cd799439011", recipientDeviceId: "device-a",
    payload: { conversationId: "507f1f77bcf86cd799439012", serverMessageId: "507f1f77bcf86cd799439013", ciphertext: "secret", plaintext: "must-not-leak" }
  }]);
  assert.equal(sent.token, "fcm-token");
  assert.equal(sent.title, "New encrypted message");
  assert.deepEqual(sent.data, {
    type: "NEW_MESSAGE",
    conversationId: "507f1f77bcf86cd799439012",
    serverMessageId: "507f1f77bcf86cd799439013",
    notificationId: "notification-a"
  });
  assert.equal(JSON.stringify(sent).includes("secret"), false);
  assert.equal(JSON.stringify(sent).includes("must-not-leak"), false);
});

test("permanently invalid FCM token is removed only from the matching device", async t => {
  t.mock.method(Device, "find", () => ({ select() { return this; }, lean: async () => [{
    _id: "device-record", userId: "507f1f77bcf86cd799439011", deviceId: "device-a", pushToken: "invalid-token"
  }] }));
  t.mock.method(notifications, "upsertEncryptedMessage", async () => ({ _id: "notification-b" }));
  t.mock.method(notifications, "recordDelivery", async () => undefined);
  t.mock.method(fcm, "sendNotification", async () => ({ errorCode: "messaging/registration-token-not-registered" }));
  let update;
  t.mock.method(Device, "updateOne", async (...args) => { update = args; });
  await push.notify([{ recipientUserId: "507f1f77bcf86cd799439011", recipientDeviceId: "device-a",
    payload: { conversationId: "conversation", serverMessageId: "message" } }]);
  assert.deepEqual(update[0], { _id: "device-record", pushToken: "invalid-token" });
  assert.deepEqual(update[1].$unset, { pushToken: 1, pushPlatform: 1, pushTokenUpdatedAt: 1 });
});
