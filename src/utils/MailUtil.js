const nodemailer = require("nodemailer");
const logger = require("./logger");
const s3Util = require("./s3Util");

// ======================================
// Constants
// ======================================

const APP_NAME = "Encryption App";

const APP_LOGO_URL =
    "https://api.makhuducomtech.co.za/shared-assets/app-logo.png";



// ======================================
// SMTP Configuration
// ======================================

function hasSmtpConfig() {

    return !!(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
    );
}


// ======================================
// Create SMTP Transporter
// ======================================

function getTransporter() {

    logger.info(
        "Creating SMTP transporter",
        {
            host:
                process.env.SMTP_HOST,

            port:
                process.env.SMTP_PORT,

            secure:
                process.env.SMTP_SECURE,

            user:
                process.env.SMTP_USER
        }
    );

    return nodemailer.createTransport({

        host:
            process.env.SMTP_HOST,

        port:
            parseInt(
                process.env.SMTP_PORT || "587",
                10
            ),

        secure:
            process.env.SMTP_SECURE === "true",

        auth: {

            user:
                process.env.SMTP_USER,

            pass:
                process.env.SMTP_PASS

        },

        tls: {

            rejectUnauthorized:
                false

        }

    });
}


// ======================================
// Send Generic Email
// ======================================
//
// IMPORTANT:
//
// This function uses positional parameters:
//
// sendMail(
//     email,
//     subject,
//     html,
//     text
// )
//
// ======================================

async function sendMail(
    email,
    subject,
    html,
    text = ""
) {

    logger.info(
        "Preparing to send email",
        {
            to:
                email,

            subject
        }
    );


    // ======================================
    // Validate Email
    // ======================================

    if (!email) {

        logger.warn(
            "Email recipient is missing"
        );

        return {

            sent:
                false,

            reason:
                "Email recipient is missing"

        };
    }


    if (!subject) {

        logger.warn(
            "Email subject is missing",
            {
                to:
                    email
            }
        );

        return {

            sent:
                false,

            reason:
                "Email subject is missing"

        };
    }


    if (!html && !text) {

        logger.warn(
            "Email content is missing",
            {
                to:
                    email,

                subject
            }
        );

        return {

            sent:
                false,

            reason:
                "Email content is missing"

        };
    }


    // ======================================
    // Check SMTP Configuration
    // ======================================

    if (!hasSmtpConfig()) {

        logger.warn(
            "SMTP configuration is missing",
            {
                host:
                    process.env.SMTP_HOST,

                port:
                    process.env.SMTP_PORT,

                user:
                    process.env.SMTP_USER
            }
        );

        return {

            sent:
                false,

            reason:
                "SMTP configuration missing"

        };
    }


    try {

        // ======================================
        // Create Transporter
        // ======================================

        const transporter =
            getTransporter();


        // ======================================
        // Verify SMTP Connection
        // ======================================

        logger.info(
            "Verifying SMTP connection..."
        );

        await transporter.verify();

        logger.info(
            "SMTP connection verified successfully"
        );


        // ======================================
        // From Address
        // ======================================

        const from =
            process.env.SMTP_FROM ||
            process.env.SMTP_USER;


        // ======================================
        // Send Email
        // ======================================

        logger.info(
            "Sending email...",
            {
                from,
                to:
                    email,
                subject
            }
        );


        const info =
            await transporter.sendMail({

                from,

                to:
                    email,

                subject,

                text,

                html

            });


        // ======================================
        // Success
        // ======================================

        logger.info(
            "Email sent successfully",
            {
                to:
                    email,

                subject,

                messageId:
                    info.messageId,

                response:
                    info.response
            }
        );


        return {

            sent:
                true,

            messageId:
                info.messageId

        };


    } catch (error) {

        logger.error(
            "Email sending failed",
            {
                to:
                    email,

                subject,

                error:
                    error.message,

                code:
                    error.code,

                command:
                    error.command,

                response:
                    error.response,

                responseCode:
                    error.responseCode,

                stack:
                    error.stack
            }
        );


        throw error;
    }
}


// ======================================
// Common Email Header
// ======================================

function buildEmailHeader() {

    return `
        <div
            style="
                text-align:center;
                padding:5px 0 25px 0;
                border-bottom:1px solid #eeeeee;
                margin-bottom:25px;
            "
        >

            <img
                src="${APP_LOGO_URL}"
                alt="${APP_NAME}"
                width="140"
                style="
                    display:block;
                    width:140px;
                    max-width:140px;
                    height:auto;
                    margin:0 auto;
                    border:0;
                    outline:none;
                    text-decoration:none;
                "
            />

        </div>
    `;
}


// ======================================
// Common Email Footer
// ======================================

function buildEmailFooter() {

    return `
        <div
            style="
                margin-top:30px;
                padding-top:20px;
                border-top:1px solid #eeeeee;
            "
        >

            <p
                style="
                    color:#777777;
                    font-size:13px;
                    line-height:1.5;
                    margin:0 0 10px 0;
                "
            >
                Helping organizations communicate
                securely through reminders, events,
                notifications and alerts.
            </p>

            <p
                style="
                    color:#777777;
                    font-size:12px;
                    text-align:center;
                    margin:20px 0 0 0;
                "
            >
                © ${new Date().getFullYear()}
                ${APP_NAME}. All rights reserved.
            </p>

        </div>
    `;
}


// ======================================
// Email Verification OTP
// ======================================

async function sendEmailOtp(
    email,
    otp
) {

    logger.info(
        "Sending Email Verification OTP",
        {
            email
        }
    );


    const subject =
        "Verify Your Email Address";


    const text = `
Verify Your Email

Welcome to Riminder!

Please use the verification code below
to verify your email address and activate
your account.

Verification Code:
${otp}

This code is valid for 10 minutes.

If you did not request this code,
please ignore this email.

Never share this verification code
with anyone.

Regards,
Riminder Team
`;


    const html =
        buildEmailTemplate(

            "Verify Email",

            "Verify Your Email",

            `
            Welcome to Riminder! Please use the
            verification code below to verify your
            email address and activate your account.
            `,

            otp
        );


    return await sendMail(
        email,
        subject,
        html,
        text
    );
}


// ======================================
// Forgot Password OTP
// ======================================

async function sendForgotPasswordOtp(
    email,
    otp
) {

    logger.info(
        "Sending Forgot Password OTP",
        {
            email
        }
    );


    const subject =
        "Reset Your Password";


    const text = `
Reset Your Password

We received a request to reset your
Riminder account password.

Your password reset OTP is:

${otp}

This code is valid for 10 minutes.

If you did not request this password reset,
please ignore this email.

Regards,
Riminder Team
`;


    const html =
        buildEmailTemplate(

            "Forgot Password",

            "Reset Your Password",

            `
            We received a request to reset your
            Riminder account password. Use the OTP
            below to continue.
            `,

            otp
        );


    return await sendMail(
        email,
        subject,
        html,
        text
    );
}




// ======================================
// Common OTP Email Template
// ======================================

function buildEmailTemplate(
    title,
    heading,
    message,
    otp
) {

    return `
<!DOCTYPE html>

<html>

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>
        ${title}
    </title>

</head>


<body
    style="
        margin:0;
        padding:0;
        background:#f5f7fa;
        font-family:Arial,Helvetica,sans-serif;
    "
>

    <div
        style="
            width:100%;
            padding:30px 0;
            background:#f5f7fa;
        "
    >

        <div
            style="
                max-width:600px;
                margin:0 auto;
                background:#ffffff;
                padding:30px;
                border-radius:8px;
                box-sizing:border-box;
                box-shadow:0 2px 8px rgba(0,0,0,0.08);
            "
        >

            ${buildEmailHeader()}


            <h2
                style="
                    margin:0 0 20px 0;
                    color:#222222;
                "
            >
                ${heading}
            </h2>


            <p
                style="
                    color:#333333;
                    line-height:1.6;
                "
            >
                ${message}
            </p>


            <div
                style="
                    margin:30px 0;
                    text-align:center;
                "
            >

                <span
                    style="
                        display:inline-block;
                        padding:15px 30px;
                        background:#f1f3f5;
                        border-radius:6px;
                        font-size:28px;
                        font-weight:bold;
                        letter-spacing:6px;
                        color:#222222;
                    "
                >
                    ${otp}
                </span>

            </div>


            <p
                style="
                    color:#555555;
                    line-height:1.6;
                "
            >
                If you did not request this code,
                please ignore this email.
            </p>


            <p
                style="
                    color:#555555;
                    line-height:1.6;
                "
            >
                Your account will remain secure.
                Never share this verification code
                with anyone.
            </p>


            <p>
                Regards,<br/>

                <strong>
                    Riminder Team
                </strong>
            </p>


            ${buildEmailFooter()}

        </div>

    </div>

</body>

</html>
`;
}



async function getFileUrl(key){

    
    let fileUrl = "";

    if (key) {

        fileUrl = await s3Util.getPreSignedUrl(
            key
        );

    }

    return fileUrl;
}


// ======================================
// Exports
// ======================================

module.exports = {

    sendMail,

    sendEmailOtp,

    sendForgotPasswordOtp,

};