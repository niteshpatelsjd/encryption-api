const firebaseConfig = require("../config/FirebaseConfig");
const logger = require("../utils/logger");

async function sendNotification({
    token,
    title,
    message,
    data,
    imageUrl
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
    sendNotification
};