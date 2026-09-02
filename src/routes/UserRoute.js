const express = require("express");
const multer = require("multer");
const router = express.Router();
const userController = require("../controllers/UserController");

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @openapi
 * /api/v1/mobileUser/requestOtp:
 *   post:
 *     tags: [User Controller]
 *     summary: Generate a four-digit OTP for an existing mobile user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MobileOtpRequest'
 *     responses:
 *       200: { description: OTP generated successfully }
 *       403: { description: Mobile user is blocked }
 *       404: { description: No mobile number found; contact admin }
 *       429: { description: OTP requested too frequently }
 * /api/v1/mobileUser/verifyOtp:
 *   post:
 *     tags: [User Controller]
 *     summary: Verify a mobile user's four-digit OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MobileOtpVerifyRequest'
 *     responses:
 *       200: { description: OTP verified successfully }
 *       401: { description: Invalid or expired OTP }
 *       429: { description: Too many invalid OTP attempts }
 */
router.post("/requestOtp", userController.requestOtp);
router.post("/verifyOtp", userController.verifyOtp);

/**
 * @openapi
 * tags:
 *   name: User Controller
 *   description: User management APIs
 */


/**
 * @openapi
 * /api/v1/mobileUser/login:
 *   post:
 *     tags: [User Controller]
 *     summary: User Login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - deviceToken
 *               - deviceType
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@gmail.com
 *               password:
 *                 type: string
 *                 example: Password@123
 *               deviceToken:
 *                 type: string
 *                 example: fcm_token
 *               deviceType:
 *                 type: string
 *                 example: ANDROID
 *     responses:
 *       200:
 *         description: Login Successful
 *       400:
 *         description: Invalid Request
 *       401:
 *         description: Invalid Email Or Password
 */
router.post("/login", userController.login);

/**
 * @openapi
 * /api/v1/mobileUser/forgotPassword:
 *   post:
 *     tags: [User Controller]
 *     summary: Send Forgot Password OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@gmail.com
 *     responses:
 *       200:
 *         description: OTP Sent Successfully
 *       400:
 *         description: Invalid Request
 *       404:
 *         description: User Not Found
 */
router.post("/forgotPassword", userController.forgotPassword);

/**
 * @openapi
 * /api/v1/mobileUser/verifyForgotOtp:
 *   post:
 *     tags: [User Controller]
 *     summary: Verify Forgot Password OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@gmail.com
 *               otp:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: OTP Verified Successfully
 */
router.post("/verifyForgotOtp", userController.verifyForgotOtp);

/**
 * @openapi
 * /api/v1/mobileUser/resetPassword:
 *   post:
 *     tags: [User Controller]
 *     summary: Reset Password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resetToken
 *               - newPassword
 *             properties:
 *               resetToken:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 example: Password@123
 *     responses:
 *       200:
 *         description: Password Reset Successfully
 */
router.post("/resetPassword", userController.resetPassword);

/**
 * @openapi
 * /api/v1/mobileUser/register:
 *   post:
 *     tags: [User Controller]
 *     summary: Register user and send email OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               countryCode:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.post("/register", userController.register);

/**
 * @openapi
 * /api/v1/mobileUser/verifyEmailOtp:
 *   post:
 *     tags: [User Controller]
 *     summary: Verify email OTP
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: otp
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Email verified successfully
 */
router.post("/verifyEmailOtp", userController.verifyEmailOtp);

/**
 * @openapi
 * /api/v1/mobileUser/createProfile:
 *   post:
 *     tags: [User Controller]
 *     summary: Create or update user profile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               imageProfile:
 *                 type: string
 *                 format: binary
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               countryCode:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *               occupation:
 *                 type: string
 *               gender:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.post(
  "/createProfile",
  upload.fields([{ name: "imageProfile", maxCount: 1 }]),
  userController.createProfile
);

/**
 * @openapi
 * /api/v1/mobileUser/getProfile:
 *   get:
 *     tags: [User Controller]
 *     summary: Get user profile by ID
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: User profile
 */
router.get("/getProfile", userController.getProfile);

/**
 * @openapi
 * /api/v1/mobileUser/getAllUsers:
 *   get:
 *     tags: [User Controller]
 *     summary: Get all users with pagination, search, user status, and optional organization/member status filters
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *
 *       # ======================================
 *       # Pagination
 *       # ======================================
 *
 *       - in: query
 *         name: pageIndex
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Page index starting from 0
 *
 *       - in: query
 *         name: pageSize
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *         description: Number of records per page
 *
 *       # ======================================
 *       # Search
 *       # ======================================
 *
 *       - in: query
 *         name: searchText
 *         required: false
 *         schema:
 *           type: string
 *         description: Search by name, email, mobile number, or occupation
 *
 *       # ======================================
 *       # User Status
 *       # ======================================
 *
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [1, 2]
 *         description: User account status (1 = Active, 2 = Inactive)
 *
 *       # ======================================
 *       # Organization
 *       # ======================================
 *
 *       - in: query
 *         name: organizationId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional organization ID. If provided, returns users belonging to this organization.
 *
 *       # ======================================
 *       # Membership Status
 *       # ======================================
 *
 *       - in: query
 *         name: memberStatus
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [0, 1, 2, 3, 4]
 *         description: |
 *           Optional organization membership status.
 *           This filter is applied only when organizationId is provided.
 *
 *           0 = Left by user
 *           1 = Pending
 *           2 = Approved
 *           3 = Removed by organization
 *           4 = Rejected by organization
 *
 *     responses:
 *
 *       200:
 *         description: User list fetched successfully
 *
 *       400:
 *         description: Invalid request parameters
 *
 *       401:
 *         description: Unauthorized
 *
 *       404:
 *         description: Users not found
 *
 *       500:
 *         description: Internal server error
 */
router.get(
  "/getAllUsers",
  userController.getAllUsers
);


/**
 * @openapi
 * /api/v1/mobileUser/updateNotificationSettings:
 *   post:
 *     tags: [User Controller]
 *     summary: Update user notification settings
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID
 *                 example: "68a123456789"
 *               notificationEnable:
 *                 type: boolean
 *                 description: Enable or disable all notifications
 *                 example: true
 *               alertNotification:
 *                 type: boolean
 *                 description: Enable or disable alert notifications
 *                 example: true
 *               announcementNotification:
 *                 type: boolean
 *                 description: Enable or disable announcement notifications
 *                 example: false
 *               eventNotification:
 *                 type: boolean
 *                 description: Enable or disable event notifications
 *                 example: true
 *     responses:
 *       200:
 *         description: Notification settings updated successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/updateNotificationSettings",
  userController.updateNotificationSettings
);



/**
 * @openapi
 * /api/v1/mobileUser/logout:
 *   get:
 *     tags: [User Controller]
 *     summary: Logout user by userId
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         description: User access token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User Logout
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/logout", userController.logout);

module.exports = router;
