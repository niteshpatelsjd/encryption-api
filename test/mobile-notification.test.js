const test = require("node:test");
const assert = require("node:assert/strict");
const Notification = require("../src/models/Notification");
const service = require("../src/services/MobileNotificationService");

const chain = value => ({
  sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value
});

test("mobile notification list is scoped to the authenticated user and device", async t => {
  let filter;
  t.mock.method(Notification, "find", value => { filter = value; return chain([]); });
  t.mock.method(Notification, "countDocuments", async () => 0);
  const result = await service.list("507f1f77bcf86cd799439011", "device-a", {});
  assert.equal(result.responseCode, 200);
  assert.deepEqual(result.responseBody.content, []);
  assert.equal(String(filter.userId), "507f1f77bcf86cd799439011");
  assert.deepEqual(filter.$or, [{ deviceId: "device-a" }, { deviceId: null }]);
});

test("encrypted message notification persistence is idempotent and contains no message material", async t => {
  let filter;
  let update;
  t.mock.method(Notification, "findOneAndUpdate", async (a, b) => { filter = a; update = b; return { _id: "notification" }; });
  await service.upsertEncryptedMessage({
    userId: "507f1f77bcf86cd799439011",
    deviceId: "device-a",
    conversationId: "conversation-a",
    serverMessageId: "message-a",
    ciphertext: "secret",
    plaintext: "hello"
  });
  assert.equal(filter.dedupeKey, "NEW_MESSAGE:507f1f77bcf86cd799439011:device-a:message-a");
  assert.deepEqual(update.$setOnInsert.data, {
    type: "NEW_MESSAGE", conversationId: "conversation-a", serverMessageId: "message-a"
  });
  assert.equal(JSON.stringify(update).includes("secret"), false);
  assert.equal(JSON.stringify(update).includes("hello"), false);
});
