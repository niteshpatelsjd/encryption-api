# Mobile incoming-call delivery contract

The foreground Socket.IO event and push notification use these string fields:

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

Android receives the existing high-priority, data-only FCM message with a
45-second TTL and no `notification` block.

iOS receives a normal APNs alert through Firebase Admin Messaging. It uses APNs
priority 10, push type `alert`, sound `default`, category
`INCOMING_SECURE_CALL`, a time-sensitive interruption level, background content
availability, and thread ID `call-{callId}`. This supports normal lock-screen
and terminated-app notification display. It intentionally does not use PushKit
or CallKit and therefore is not a native full-screen VoIP call guarantee.

Call state pushes contain only:

```json
{
  "type": "CALL_ACCEPTED",
  "callId": "CALL_SESSION_OBJECT_ID",
  "conversationId": "CONVERSATION_OBJECT_ID",
  "state": "ACTIVE"
}
```

Types/states include accepted, declined, cancelled, ended, and expired. No call
push contains a LiveKit token, API key, secret, room credential, or E2EE key.

Clients should send a stable, unique `clientCallId` (maximum 128 characters)
when creating a call. Repeating it for the same caller returns the existing call
and does not send another invite. Ringing calls expire after
`CALL_INVITE_TTL_SECONDS` (default 45); the expiry worker scans using
`CALL_EXPIRY_POLL_MS` (default 5000).

## Firebase and APNs deployment

Upload the Apple APNs authentication key or certificate in Firebase Console for
the iOS application. The iOS app's bundle ID must match the Firebase iOS app.
Set the backend Firebase service-account variables and set
`IOS_FIREBASE_PROJECT_ID` to the `PROJECT_ID` value from
`GoogleService-Info.plist`. Startup rejects a configured mismatch.

Existing ringing call records created before this release should be marked ended
or migrated with an `expiresAt` value before deployment. In multi-instance
deployments, the atomic database update ensures only one worker expires a call,
although every application instance may run the lightweight expiry scanner.
