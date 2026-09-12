# Mobile incoming-call delivery contract

The backend sends the foreground Socket.IO event `CALL_INVITE` and a background
FCM data-only message. Both use these fields:

```json
{
  "type": "CALL_INVITE",
  "callId": "CALL_SESSION_OBJECT_ID",
  "conversationId": "CONVERSATION_OBJECT_ID",
  "callerUserId": "CALLER_USER_OBJECT_ID",
  "callerName": "A contact",
  "callerProfileUrl": "",
  "mode": "audio"
}
```

Every FCM `data` value is a string. The Android message is high priority, expires
after 45 seconds, and has no FCM `notification` block. It contains no LiveKit
token, room credential, API key, secret, or E2EE key. It is sent to every active
device record for the recipient that has a push token.

`POST /api/v1/calls/:callId/respond` requires the normal authenticated mobile
access token. Body: `{ "action": "accept" }` or `{ "action": "decline" }`.
Only a non-initiating participant of that still-ringing call can change it.
LiveKit credentials are generated only after the atomic ownership/state check
succeeds. An unrelated user, the caller, an expired invite, or a second response
receives:

```json
{
  "responseCode": 404,
  "message": "Call is no longer available",
  "responseBody": null
}
```

## Infrastructure note

Android background delivery uses Firebase high-priority data messages. iOS
background data notifications are best-effort and can be throttled by the OS.
For WhatsApp-style reliability on locked or terminated iPhones, production must
add Apple PushKit VoIP pushes and CallKit using the APNs VoIP credential. Standard
FCM data-only delivery alone cannot guarantee that behavior on iOS.
