const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Device = require("../src/models/Device");
const User = require("../src/models/User");
const AdminUser = require("../src/models/AdminUser");
const UserSession = require("../src/models/UserSession");
const RefreshToken = require("../src/models/RefreshToken");
const DevicePrekey = require("../src/models/DevicePrekey");
const OneTimePrekey = require("../src/models/OneTimePrekey");
const SecurityEvent = require("../src/models/SecurityEvent");
const securityRepo = require("../src/repositories/SecurityRepository");
const access = require("../src/services/MobileAccessService");
const revokeService = require("../src/services/DeviceRevocationService");
const auth = require("../src/middleware/auth");
const mixedAuth = require("../src/middleware/deviceListAuth");
const controller = require("../src/controllers/MobileUserDeviceController");
const deviceService = require("../src/services/DeviceService");
const authService = require("../src/services/AuthService");
const provisioningService = require("../src/services/ProvisioningService");
const presence = require("../src/socket/PresenceService");
const socketAccess = require("../src/socket/MobileSocketAccess");
const redis = require("../src/config/RedisConfig");
redis.disconnect();
const uid = "507f1f77bcf86cd799439011";
const adminId = "507f1f77bcf86cd799439012";
const otherId = "507f1f77bcf86cd799439013";
const chain = value => ({ select() { return this; }, lean: async () => value });
function env(t, key, value) {
  const old = process.env[key];
  process.env[key] = value;
  t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
}
function response() { return { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function token(t, deviceId = "target") {
  env(t, "JWT_ACCESS_SECRET", "test-only-mobile-key");
  return jwt.sign({ purpose: "ACCESS", userId: uid, deviceId }, process.env.JWT_ACCESS_SECRET, { issuer: "encryption-api", expiresIn: "15m" });
}
function revoked(t) { t.mock.method(Device, "findOne", () => chain({ status: "REVOKED" })); }

test("unexpired access token from revoked device is rejected on HTTP", async t => {
  const accessToken = token(t); revoked(t);
  const res = response();
  await auth({ headers: { authorization: `Bearer ${accessToken}` } }, res, () => assert.fail("must deny"));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.responseBody.code, "DEVICE_REVOKED");
});

test("offline revoked device cannot reconnect", async t => {
  const accessToken = token(t); revoked(t);
  let error;
  await socketAccess.authenticate({ handshake: { auth: { token: accessToken, deviceId: "target" } }, data: {} }, value => { error = value; });
  assert.equal(error.data.code, "DEVICE_REVOKED");
});

test("already-connected revoked socket cannot send events", async t => {
  const accessToken = token(t); revoked(t);
  let guard, ack, disconnected = false, error;
  const socket = { handshake: { auth: { token: accessToken } }, data: { userId: uid, deviceId: "target" }, connected: true,
    use(fn) { guard = fn; }, on() {}, emit() {}, disconnect() { disconnected = true; } };
  socketAccess.protectEvents(socket);
  await guard(["MESSAGE_SEND", {}, value => { ack = value; }], value => { error = value; });
  assert.equal(ack.errorCode, "DEVICE_REVOKED");
  assert.equal(error.data.code, "DEVICE_REVOKED");
  assert.equal(disconnected, true);
});

test("revoked refresh token returns DEVICE_REVOKED and cannot create a session", async t => {
  revoked(t);
  t.mock.method(RefreshToken, "findOne", async () => ({ userId: uid, deviceId: "target", revokedAt: new Date() }));
  t.mock.method(RefreshToken, "create", () => assert.fail("must not create a replacement"));
  const result = await authService.refresh({ refreshToken: "test-only-refresh" });
  assert.equal(result.responseCode, 401);
  assert.equal(result.responseBody.code, "DEVICE_REVOKED");
});

test("mobile caller cannot select another user for revocation", async t => {
  t.mock.method(deviceService, "remove", () => assert.fail("must not revoke"));
  const res = response();
  await controller.removeDevice({ user: { userId: uid }, query: { userId: otherId }, params: { deviceId: "target" } }, res);
  assert.equal(res.statusCode, 403);
});

test("verified active admin can revoke selected user's device without targeting itself", async t => {
  env(t, "JWT_SECRET", "test-only-admin-key");
  t.mock.method(AdminUser, "findById", () => chain({ _id: adminId, status: 1 }));
  const adminToken = jwt.sign({ purpose: "ADMIN_ACCESS", adminUserId: adminId }, process.env.JWT_SECRET);
  let target;
  t.mock.method(deviceService, "remove", async (...args) => { target = args; return { responseCode: 200 }; });
  const req = { headers: { authorization: `Bearer ${adminToken}` }, query: { userId: uid }, params: { deviceId: "target" } };
  const res = response();
  await mixedAuth(req, res, () => controller.removeDevice(req, res));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(target.slice(0, 2), [uid, "target"]);
  assert.equal(target[2].adminUserId, adminId);
});

test("revocation persists first, scopes cleanup and audit, and safely retries", async t => {
  const order = [];
  let wasRevoked = false;
  const record = { userId: uid, deviceId: "target", status: "REVOKED", revokedAt: new Date() };
  t.mock.method(Device, "findOneAndUpdate", async filter => {
    assert.equal(filter.userId, uid); assert.equal(filter.deviceId, "target");
    order.push("persist"); if (wasRevoked) return null; wasRevoked = true; return record;
  });
  t.mock.method(Device, "findOne", async () => record);
  for (const [model, method] of [[RefreshToken, "updateMany"], [DevicePrekey, "deleteMany"], [OneTimePrekey, "deleteMany"]]) {
    t.mock.method(model, method, async filter => {
      assert.equal(filter.userId, uid); assert.equal(filter.deviceId, "target"); order.push("cleanup");
    });
  }
  t.mock.method(User, "updateOne", async filter => { assert.deepEqual(filter, { _id: uid, activeDeviceId: "target" }); });
  t.mock.method(AdminUser, "updateMany", () => assert.fail("admin must remain unchanged"));
  t.mock.method(UserSession, "updateMany", () => assert.fail("admin sessions must remain unchanged"));
  t.mock.method(SecurityEvent, "create", async event => {
    assert.equal(event.metadata.actorId, adminId); assert.equal(event.userId, uid); order.push("audit");
  });
  t.mock.method(presence, "revokeDeviceConnections", async event => {
    assert.equal(event.code, "DEVICE_REVOKED"); assert.equal(event.deviceId, "target"); order.push("notify");
  });
  const first = await revokeService.revoke(uid, "target", { adminUserId: adminId });
  const again = await revokeService.revoke(uid, "target", { adminUserId: adminId });
  assert.equal(first.responseCode, 200); assert.equal(again.responseBody.alreadyRevoked, true);
  assert.equal(order[0], "persist"); assert.ok(order.indexOf("notify") > order.indexOf("audit"));
});

test("online event precedes disconnect and never affects other user/device sockets", async () => {
  const events = [];
  function socket(userId, deviceId) {
    return { data: { userId, deviceId }, emit(event, payload) { events.push([event, payload.deviceId]); }, disconnect() { events.push(["disconnect", deviceId]); } };
  }
  presence.setPresenceServer({ in: () => ({ fetchSockets: async () => [socket(uid, "target"), socket(uid, "other"), socket(adminId, "target"), socket(uid, "target")] }) });
  try {
    await presence.revokeDeviceConnections({ code: "DEVICE_REVOKED", userId: uid, deviceId: "target", revokedAt: new Date().toISOString() });
    assert.deepEqual(events.map(event => event[0]), ["device:revoked", "device:revoked", "disconnect", "disconnect"]);
  } finally { presence.setPresenceServer(null); }
});

test("unrelated active mobile device remains authorized", async t => {
  const accessToken = token(t, "other");
  t.mock.method(Device, "findOne", filter => { assert.equal(filter.deviceId, "other"); return chain({ status: "ACTIVE" }); });
  t.mock.method(User, "findOne", () => chain({ activeDeviceId: "other" }));
  t.mock.method(RefreshToken, "exists", async () => true);
  assert.equal((await access.verifyAccess(accessToken)).deviceId, "other");
});

test("client cannot subscribe to arbitrary socket rooms", async t => {
  t.mock.method(access, "verifyAccess", async () => ({ userId: uid, deviceId: "target" }));
  let guard, ack;
  socketAccess.protectEvents({ handshake: { auth: {} }, connected: true, use(fn) { guard = fn; }, on() {}, data: {} });
  await guard(["join", `user:${adminId}`, value => { ack = value; }], error => assert.equal(error.data.code, "EVENT_NOT_ALLOWED"));
  assert.equal(ack.errorCode, "EVENT_NOT_ALLOWED");
});

test("cleanup failure leaves revocation persisted, audits failure, and disconnects", async t => {
  const record = { status: "REVOKED", revokedAt: new Date() };
  let denied = false, notified = false, audit;
  t.mock.method(Device, "findOneAndUpdate", async () => { denied = true; return record; });
  t.mock.method(RefreshToken, "updateMany", async () => { throw new Error("storage unavailable"); });
  t.mock.method(SecurityEvent, "create", async value => { audit = value; });
  t.mock.method(presence, "revokeDeviceConnections", async () => { notified = true; });
  const result = await revokeService.revoke(uid, "target", { adminUserId: adminId });
  assert.equal(denied, true); assert.equal(notified, true);
  assert.equal(result.responseCode, 503);
  assert.equal(result.responseBody.code, "REVOCATION_CLEANUP_PENDING");
  assert.equal(audit.outcome, "FAILURE");
});

test("legacy/ambiguous token cannot be promoted to admin authority", async t => {
  env(t, "JWT_SECRET", "test-only-admin-key");
  const ambiguous = jwt.sign({ email: "admin@example.test" }, process.env.JWT_SECRET);
  const res = response();
  await mixedAuth({ headers: { authorization: `Bearer ${ambiguous}` } }, res, () => assert.fail("must reject untyped token"));
  assert.equal(res.statusCode, 401);
});

test("mobile owner retains own-device revocation ability", async t => {
  let args;
  t.mock.method(deviceService, "remove", async (...values) => { args = values; return { responseCode: 200 }; });
  const res = response();
  await controller.removeDevice({ user: { userId: uid }, query: {}, params: { deviceId: "own-other-device" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(args.slice(0, 2), [uid, "own-other-device"]);
  assert.equal(args[2].adminUserId, undefined);
});

test("database failure fails closed for protected HTTP", async t => {
  const accessToken = token(t);
  t.mock.method(Device, "findOne", () => ({ select() { return this; }, lean: async () => { throw new Error("database unavailable"); } }));
  const res = response();
  await auth({ headers: { authorization: `Bearer ${accessToken}` } }, res, () => assert.fail("must fail closed"));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.responseBody.code, "AUTH_SERVICE_UNAVAILABLE");
});

test("blocking a user proactively revokes every active device socket", async t => {
  const user = { status: 1, async save() {} };
  t.mock.method(User, "findById", async () => user);
  t.mock.method(Device, "find", () => ({ select() { return this; }, lean: async () => [
    { deviceId: "device-a" }, { deviceId: "device-b" }
  ] }));
  t.mock.method(Device, "updateMany", async () => ({}));
  t.mock.method(RefreshToken, "updateMany", async () => ({}));
  t.mock.method(DevicePrekey, "deleteMany", async () => ({}));
  t.mock.method(OneTimePrekey, "deleteMany", async () => ({}));
  t.mock.method(SecurityEvent, "create", async () => ({}));
  t.mock.method(securityRepo, "logSecurityEvent", async () => ({}));
  const events = [];
  t.mock.method(presence, "revokeDeviceConnections", async payload => events.push(payload));

  const result = await provisioningService.updateMobileUserStatus(
    { id: uid, status: 2, remark: "Security action" },
    { adminUserId: adminId }
  );
  assert.equal(result.responseCode, 200);
  assert.equal(user.status, 2);
  assert.deepEqual(events.map(event => event.deviceId).sort(), ["device-a", "device-b"]);
  assert.ok(events.every(event => event.code === "DEVICE_REVOKED" &&
    event.userId === uid && event.reason === "ADMIN_REVOKED" && event.revokedAt));
});
