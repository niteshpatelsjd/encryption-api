const { initializeApp, cert, getApps, getApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("../utils/logger");

function getFirebaseApp() {

    try {

        if (getApps().length > 0) {
            return getApp();
        }

        const serviceAccount = getServiceAccount();

        let app;

        if (serviceAccount) {

            app = initializeApp({
                credential: cert(serviceAccount)
            });

        } else {

            app = initializeApp();
        }

        logger.info("Firebase initialized successfully", {
            projectId: serviceAccount?.projectId || process.env.GOOGLE_CLOUD_PROJECT || null
        });

        return app;

    } catch (error) {

        logger.error("Firebase initialization failed", {
            error: error.message,
            stack: error.stack
        });

        return null;
    }
}

function messaging() {

    const app = getFirebaseApp();

    return app ? getMessaging(app) : null;
}

function getServiceAccount() {

    if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
    ) {

        return {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        };
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {

        return JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        );
    }

    return null;
}
module.exports = {
    getMessaging: messaging
};