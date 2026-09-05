# Mobile-device revocation

## Admin/mobile API

`DELETE /api/v1/devices/:deviceId?userId=<mobile-user-id>` with a Bearer token.

- Admin: use an `ADMIN_ACCESS` token from a fresh admin sign-in and supply `userId`. The account must exist in `admin_users` with status 1.
- Mobile: use an `ACCESS` token; omit `userId` or supply your own. Selecting another user returns HTTP 403 with `responseBody.code = DEVICE_OWNERSHIP_REQUIRED`.
- A device ID is always scoped to its mobile user. Neither admin session records nor other device records are mutated.
- Revocation persists `Device.status = REVOKED` first, closes all matching mobile refresh-token/session records, deletes signed and one-time public prekeys, and clears `activeDeviceId` only if it still points at this device. An audit event records the actor, target and result, never tokens or key material.
- Successful retries return HTTP 200 with `alreadyRevoked: true`. When revoking your current mobile device, later retries need another authorized device or an admin token.

Success response:

```json
{
  "responseCode": 200,
  "message": "Device revoked",
  "responseBody": {
    "code": "DEVICE_REVOKED",
    "userId": "507f1f77bcf86cd799439011",
    "deviceId": "mobile-device-id",
    "reason": "ADMIN_REVOKED",
    "revokedAt": "2026-09-04T12:00:00.000Z",
    "alreadyRevoked": false,
    "notificationPending": false
  }
}
```

The reason is `USER_REVOKED` for a mobile caller. HTTP 404 uses `DEVICE_NOT_FOUND`. HTTP 400 uses `INVALID_DEVICE_TARGET` for malformed targets. If cleanup or audit persistence fails after the deny marker is saved, HTTP 503 uses `REVOCATION_CLEANUP_PENDING`: access is already blocked; retry the identical DELETE until 200. A notification transport failure returns 200 with `notificationPending: true`; retrying attempts delivery again.

## Mobile event contract

After persistence, the server emits `device:revoked` to every socket whose **verified** identity matches both the target user and target device, then disconnects those sockets. No client room name is trusted.

```json
{
  "code": "DEVICE_REVOKED",
  "userId": "507f1f77bcf86cd799439011",
  "deviceId": "mobile-device-id",
  "reason": "ADMIN_REVOKED",
  "revokedAt": "2026-09-04T12:00:00.000Z"
}
```

The per-event authorization guard may also emit this event with `reason: SERVER_REVOKED` and `revokedAt: null` when it detects a revoked connection. Treat either as terminal. Stop reconnect/retry loops, clear authentication state, and require activation with a **new device ID**. Private-key/local-data disposal remains the mobile app's responsibility; the server cannot remotely guarantee deletion.

Socket emission is best effort, not proof that the phone received it. Offline phones are still revoked.

## HTTP and socket rejection contract

Every endpoint using mobile `auth` (including the mixed device-list/delete guard) rechecks the persisted device and active mobile session on every request. Every socket handshake and incoming application event rechecks the access token and the same server-side state.

For an otherwise valid, unexpired token tied to a revoked device:

```json
{
  "responseCode": 401,
  "message": "This device has been revoked",
  "responseBody": { "code": "DEVICE_REVOKED" }
}
```

- Socket `connect_error.data.code`: `DEVICE_REVOKED`.
- Socket event acknowledgement: `{ "success": false, "errorCode": "DEVICE_REVOKED", "message": "This device has been revoked" }`; handler execution is blocked and the socket disconnected.
- Refresh with a known token from the revoked device: HTTP 401, `responseBody.code = DEVICE_REVOKED`, even if that refresh record is already revoked.
- Expired/invalid access tokens: `ACCESS_TOKEN_EXPIRED` / `INVALID_ACCESS_TOKEN`. Refresh then identifies revocation when its retained token record is found.
- Unknown/purged refresh token: `INVALID_REFRESH_TOKEN`; unknown device: `DEVICE_NOT_REGISTERED`; ended session: `SESSION_REVOKED`.
- Authentication database failure: HTTP 503 / `AUTH_SERVICE_UNAVAILABLE`; do not treat a temporary outage as device revocation.
- Unknown socket events (including raw room joins): `EVENT_NOT_ALLOWED`. Presence subscriptions are limited to self and users sharing an active conversation membership.

## Deployment and limitations

1. Deploy all changed server files together; restart the Node process so existing sockets reconnect through the new checks. No web-admin UI changes are required.
2. Admins must sign in again. New login and OTP tokens carry `purpose: ADMIN_ACCESS` and `adminUserId`. Old untyped admin tokens are intentionally rejected because they cannot reliably be distinguished from other JWT uses signed with the same secret. Verify admin account status is 1.
3. Retain revoked device records and refresh-token records. Never reactivate a revoked `(userId, deviceId)` pair or delete its tombstone while old credentials could exist. A fresh activation must generate a new device ID. Keep the existing unique `{userId, deviceId}` index installed.
4. `refresh_tokens` is the mobile session store. `UserSession` is legacy/admin data without a trustworthy mobile device ID; this operation deliberately does not modify it.
5. The current Socket.IO adapter is process-local. Run one API/socket process for immediate targeted event/disconnect guarantees. Before scaling to multiple processes/hosts, install/configure a distributed Socket.IO adapter supporting `fetchSockets` and remote disconnect, and test cross-node revocation. Merely running Redis for presence is not a distributed Socket.IO adapter.
6. Cleanup is deliberately deny-first and retryable, not a multi-document transaction: this works with standalone MongoDB as well as replica sets. A crash between the deny marker and cleanup leaves the device blocked; retry DELETE to finish cleanup/audit. Monitor 503 cleanup responses. Replica-set transactions plus a durable outbox/cleanup worker are future options for fully atomic cleanup and crash-independent notification retries.
7. In-flight operations authorized before the revocation commit may finish. Every subsequent request/event is denied. Test concurrent refresh, send, key upload, and revocation against your deployed MongoDB topology before release. Event delivery over a failing network is not guaranteed and must never be the only mobile enforcement mechanism.
8. This change covers protected mobile endpoints. It does not redesign unrelated legacy public routes or the admin UI; those need a separate authorization audit before public deployment.

## Verification

Run `npm test`. `test/device-revocation.test.js` exercises real JWT verification with mocked database/socket boundaries: admin targeting, mobile ownership, old access tokens, offline handshake, connected events, refresh rejection, cleanup retry/failure, unaffected admin/other-device records, and event-before-disconnect ordering. These are not live MongoDB/Redis or multi-node transport tests. In staging, repeat with two phones and an admin login, including an offline phone, lost DELETE response, concurrent token refresh, and a separate socket-server process if using a distributed adapter.
