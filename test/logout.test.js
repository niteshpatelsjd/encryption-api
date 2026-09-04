const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/services/AuthService');
const tokens = require('../src/services/TokenService');
const Device = require('../src/models/Device');
const User = require('../src/models/User');
const RefreshToken = require('../src/models/RefreshToken');
const presence = require('../src/socket/PresenceService');
const redis = require('../src/config/RedisConfig');
test.after(() => redis.disconnect());

test('logout revokes only the token device and conditionally clears its active pointer', async t => {
  const calls = {};
  t.mock.method(tokens, 'revoke', async () => ({ userId: 'user-a', deviceId: 'device-a' }));
  t.mock.method(Device, 'updateOne', async (query, update) => { calls.device = { query, update }; });
  t.mock.method(RefreshToken, 'updateMany', async query => { calls.tokens = query; });
  t.mock.method(User, 'updateOne', async (query, update) => { calls.user = { query, update }; });
  t.mock.method(presence, 'disconnectDevice', async (...args) => { calls.socket = args; });
  const result = await auth.logout({ refreshToken: 'opaque-token' });
  assert.equal(result.responseCode, 200);
  assert.deepEqual(calls.device.query, { userId: 'user-a', deviceId: 'device-a', status: 'ACTIVE' });
  assert.equal(calls.device.update.$set.status, 'REVOKED');
  assert.ok(calls.device.update.$set.revokedAt instanceof Date);
  assert.deepEqual(calls.tokens, { userId: 'user-a', deviceId: 'device-a', revokedAt: null });
  assert.deepEqual(calls.user.query, { _id: 'user-a', activeDeviceId: 'device-a' });
  assert.equal(calls.user.update.$set.activeDeviceId, null);
  assert.deepEqual(calls.socket, ['user-a', 'device-a']);
});

test('invalid or already revoked logout token cannot revoke a device', async t => {
  t.mock.method(tokens, 'revoke', async () => null);
  const update = t.mock.method(Device, 'updateOne', async () => { throw new Error('Unexpected write'); });
  assert.equal((await auth.logout({ refreshToken: 'invalid' })).responseCode, 200);
  assert.equal(update.mock.callCount(), 0);
});

test('logout requires a refresh token', async () => {
  assert.equal((await auth.logout({})).responseCode, 400);
});
