const test = require("node:test");
const assert = require("node:assert/strict");

const activationService = require("../src/services/ActivationService");
const deviceService = require("../src/services/DeviceService");
const tokenService = require("../src/services/TokenService");
const securityRepo = require("../src/repositories/SecurityRepository");
const RefreshToken = require("../src/models/RefreshToken");
const DevicePrekey = require("../src/models/DevicePrekey");
const OneTimePrekey = require("../src/models/OneTimePrekey");
const User = require("../src/models/User");
const presenceService = require("../src/socket/PresenceService");
const redis = require("../src/config/RedisConfig");

const originals = new Map();
function replace(target, key, value) {
  originals.set(`${target.constructor?.modelName || "object"}:${key}:${originals.size}`, [target, key, target[key]]);
  target[key] = value;
}

test.afterEach(() => {
  for (const [, [target, key, value]] of [...originals].reverse()) target[key] = value;
  originals.clear();
});

test.after(() => redis.disconnect());

function stubRegistrationDependencies() {
  replace(require("../src/models/Device"), "exists", async () => null);
  replace(activationService, "verifyActivationToken", () => ({ activationId: "activation-1", userId: "user-1" }));
  replace(securityRepo, "findActivationById", async () => ({ userId: { toString: () => "user-1" }, status: "PENDING", expiresAt: new Date(Date.now() + 60_000) }));
  replace(securityRepo, "findActiveDevices", async () => [{ deviceId: "device-a", deviceType: "ANDROID", deviceName: "Pixel 8", lastSeenAt: new Date(), createdAt: new Date() }]);
  replace(securityRepo, "registerDevice", async (_userId, data) => ({ ...data, identityKeyAlgorithm: "X25519" }));
  replace(securityRepo, "consumeActivation", async () => ({ _id: "activation-1" }));
  replace(securityRepo, "revokeOtherDevices", async () => ({ modifiedCount: 1 }));
  replace(securityRepo, "logSecurityEvent", async () => null);
  replace(tokenService, "issueTokenPair", async () => ({ accessToken: "access", refreshToken: "refresh" }));
  replace(User, "updateOne", async () => ({ modifiedCount: 1 }));
  replace(RefreshToken, "updateMany", async () => ({ modifiedCount: 1 }));
  replace(DevicePrekey, "deleteMany", async () => ({ deletedCount: 1 }));
  replace(OneTimePrekey, "deleteMany", async () => ({ deletedCount: 100 }));
}

const request = {
  activationToken: "activation-token",
  deviceId: "device-b",
  deviceType: "ANDROID",
  deviceName: "Galaxy S25",
  identityKey: "public-key",
  identityKeyAlgorithm: "X25519"
};

test("a second device cannot replace the active device without explicit confirmation", async () => {
  stubRegistrationDependencies();
  let registered = false;
  replace(securityRepo, "registerDevice", async () => { registered = true; });

  const result = await deviceService.register(request);

  assert.equal(result.responseCode, 409);
  assert.equal(result.responseBody.code, "DEVICE_REPLACEMENT_CONFIRMATION_REQUIRED");
  assert.equal(result.responseBody.activeDevice.deviceId, "device-a");
  assert.equal(registered, false);
});

test("confirmed replacement revokes the old device and announces forced logout", async () => {
  stubRegistrationDependencies();
  let activeDeviceId = null;
  let revoked = false;
  let disconnected = null;
  replace(User, "updateOne", async (_query, update) => { activeDeviceId = update.$set.activeDeviceId; });
  replace(securityRepo, "revokeOtherDevices", async () => { revoked = true; });
  replace(presenceService, "disconnectDevice", async (...args) => { disconnected = args; });

  const result = await deviceService.register({ ...request, replaceExistingDevice: true, replacedDeviceId: "device-a" });

  assert.equal(result.responseCode, 201);
  assert.equal(activeDeviceId, "device-b");
  assert.equal(revoked, true);
  assert.deepEqual(disconnected.slice(0, 2), ["user-1", "device-a"]);
  assert.equal(disconnected[2].reason, "REPLACED_BY_NEW_DEVICE");
  assert.equal(disconnected[2].replacementDevice.deviceName, "Galaxy S25");
});
