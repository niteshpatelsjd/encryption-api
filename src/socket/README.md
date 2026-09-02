# Socket.IO contract

Connect to the API origin with:

```js
auth: { token: accessToken, deviceId }
```

Authentication errors expose safe metadata through `connect_error.data`:

- `code: AUTHENTICATION_FAILED`, with `reason: ACCESS_TOKEN_EXPIRED` or `INVALID_ACCESS_TOKEN`
- `code: DEVICE_NOT_REGISTERED`
- `code: SERVER_UNAVAILABLE`

Presence events:

- Client emits `PRESENCE_SUBSCRIBE` with `{ userIds: string[] }`.
- Client emits `PRESENCE_UNSUBSCRIBE` with `{ userIds: string[] }`.
- Server emits `PRESENCE_UPDATE`, `USER_ONLINE`, and `USER_OFFLINE`.
- At most 100 unique valid user IDs are accepted per subscription request.

Presence is user-level. A user becomes offline only after their last authenticated device socket disconnects.

## Messaging events

- Client emits `MESSAGE_SEND` with an encrypted message and per-device ciphertext envelopes.
- Server emits `MESSAGE_NEW` only to the intended recipient device.
- Client emits `MESSAGE_DELIVERED` with `{ serverMessageId }` after securely storing the ciphertext.
- Client emits `MESSAGE_READ` with `{ serverMessageId }` when the message becomes visible.
- The server emits `MESSAGE_DELIVERED` and `MESSAGE_READ` to the sender's active devices.

All client message sends must retain the same UUID `clientMessageId` during retries. Socket acknowledgement responses identify the persisted `serverMessageId` and never contain plaintext.

## Typing events

Client starts typing:

```js
socket.emit("TYPING_START", { conversationId }, acknowledgement);
```

Client stops typing:

```js
socket.emit("TYPING_STOP", { conversationId }, acknowledgement);
```

Other active conversation members receive:

```js
{
  conversationId,
  userId,
  deviceId,
  isTyping: true,
  timestamp
}
```

through `TYPING_UPDATE`. The server validates the active device and conversation membership, throttles repeated start broadcasts, automatically emits `isTyping: false` after five seconds of inactivity, and clears typing state on disconnect. Typing state is never persisted.
