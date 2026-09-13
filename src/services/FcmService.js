const firebaseConfig = require("../config/FirebaseConfig");
const logger = require("../utils/logger");

async function sendNotification({
    token,
    title,
    message,
    data,
    imageUrl,
    androidChannelId = "default",
    apnsCategory,
    groupKey
}) {

    if (!token) {

        return {
            sentStatus: "FAILED",
            failureReason: "Device token not found",
            firebaseMessageId: null
        };

    }

    const messaging = firebaseConfig.getMessaging();

    if (!messaging) {

        return {
            sentStatus: "FAILED",
            failureReason: "Firebase is not configured",
            firebaseMessageId: null
        };

    }

    try {

        const firebaseMessageId = await messaging.send({

            token,

            notification: {
                title,
                body: message,
                ...(imageUrl ? { imageUrl } : {})
            },

            data: stringifyData(data)
            ,android: {
                priority: "high",
                notification: {
                    channelId: androidChannelId,
                    sound: "default",
                    ...(groupKey ? { tag: groupKey } : {})
                }
            },
            apns: {
                headers: {
                    "apns-priority": "10",
                    ...(groupKey ? { "apns-collapse-id": groupKey } : {})
                },
                payload: {
                    aps: {
                        sound: "default",
                        ...(apnsCategory ? { category: apnsCategory } : {}),
                        ...(groupKey ? { threadId: groupKey } : {})
                    }
                }
            }

        });

        logger.info("FCM notification sent", {
            firebaseMessageId
        });

        return {

            sentStatus: "SENT",

            failureReason: null,

            firebaseMessageId

        };

    } catch (error) {

        logger.error("FCM notification failed", {

            error: error.message,

            stack: error.stack

        });

        return {

            sentStatus: "FAILED",

            failureReason: error.message,
            errorCode: error.code || null,

            firebaseMessageId: null

        };

    }

}

async function sendDataOnly({ token, data, ttlMs = 45 * 1000 }) {
    if (!token) {
        return { sentStatus: "FAILED", failureReason: "Device token not found", firebaseMessageId: null };
    }
    const messaging = firebaseConfig.getMessaging();
    if (!messaging) {
        return { sentStatus: "FAILED", failureReason: "Firebase is not configured", firebaseMessageId: null };
    }
    const normalizedTtl = Math.min(Math.max(Number(ttlMs) || 45 * 1000, 1000), 60 * 1000);
    try {
        const firebaseMessageId = await messaging.send({
            token,
            data: stringifyData(data),
            android: { priority: "high", ttl: normalizedTtl },
            apns: {
                headers: {
                    "apns-priority": "5",
                    "apns-push-type": "background",
                    "apns-expiration": String(Math.floor((Date.now() + normalizedTtl) / 1000))
                },
                payload: { aps: { contentAvailable: true } }
            }
        });
        logger.info("FCM data message sent", { firebaseMessageId, type: data?.type || null });
        return { sentStatus: "SENT", failureReason: null, firebaseMessageId };
    } catch (error) {
        logger.error("FCM data message failed", { error: error.message, code: error.code || null });
        return {
            sentStatus: "FAILED",
            failureReason: error.message,
            errorCode: error.code || null,
            firebaseMessageId: null
        };
    }
}

async function sendIosCallAlert({ token, data, callerName, mode, callId }) {
    if (!token) {
        return { sentStatus: "FAILED", failureReason: "Device token not found", firebaseMessageId: null };
    }
    const messaging = firebaseConfig.getMessaging();
    if (!messaging) {
        return { sentStatus: "FAILED", failureReason: "Firebase is not configured", firebaseMessageId: null };
    }
    try {
        const safeName = callerName || "A contact";
        const safeMode = mode === "video" ? "video" : "audio";
        const firebaseMessageId = await messaging.send({
            token,
            data: stringifyData(data),
            apns: {
                headers: {
                    "apns-priority": "10",
                    "apns-push-type": "alert",
                    "apns-expiration": String(Math.floor((Date.now() + 45 * 1000) / 1000))
                },
                payload: {
                    aps: {
                        alert: { title: safeName, body: `Incoming secure ${safeMode} call` },
                        sound: "default",
                        category: "INCOMING_SECURE_CALL",
                        contentAvailable: true,
                        interruptionLevel: "time-sensitive",
                        threadId: `call-${String(callId)}`
                    }
                }
            }
        });
        return { sentStatus: "SENT", failureReason: null, firebaseMessageId };
    } catch (error) {
        return {
            sentStatus: "FAILED",
            failureReason: error.message,
            errorCode: error.code || null,
            firebaseMessageId: null
        };
    }
}

function stringifyData(data = {}) {

    return Object.entries(data).reduce((result, [key, value]) => {

        result[key] =
            typeof value === "string"
                ? value
                : JSON.stringify(value);

        return result;

    }, {});

}

module.exports = {
    sendNotification,
    sendDataOnly,
    sendIosCallAlert
};
