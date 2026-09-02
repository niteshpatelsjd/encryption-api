const router = require("express").Router();
const controller = require("../controllers/MobileUserDeviceController");
const adminAuth = require("../middleware/adminAuth");
const auth = require("../middleware/auth");
const activationRateLimit = require("../middleware/activationRateLimit");
const rejectSensitive = require("../middleware/rejectSensitiveMaterial");
const deviceListAuth = require("../middleware/deviceListAuth");

/**
 * @openapi
 * /api/v1/mobileUser:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Create a mobile user from the Admin Panel
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, mobileNumber]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               countryCode: { type: string }
 *               mobileNumber: { type: string }
 *     responses:
 *       201: { description: Mobile user created }
 * /api/v1/mobileUser/{userId}/generate-serial:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Generate a random expiring activation code
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Activation code generated }
 * /api/v1/mobileUser/blockUnblockUser:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Delete, activate, or block a mobile user
 *     description: Deleting or blocking revokes all devices and refresh tokens and removes public prekeys.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MobileUserStatusRequest'
 *     responses:
 *       200: { description: Mobile-user status updated }
 *       400: { description: Invalid or unchanged status }
 *       404: { description: No mobile number found; contact admin }
 */
router.post("/mobileUser", adminAuth, controller.createMobileUser);
router.post("/mobileUser/:userId/generate-serial", adminAuth, controller.generateSerial);
router.post("/mobileUser/blockUnblockUser", adminAuth, controller.updateMobileUserStatus);

/**
 * @openapi
 * /api/v1/auth/activate:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Validate an activation code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActivationRequest'
 *     responses:
 *       200: { description: Activation validated }
 *       429: { description: Too many attempts }
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Rotate a refresh token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200: { description: Tokens refreshed }
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Revoke a refresh token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200: { description: Logged out }
 */
router.post("/auth/activate", activationRateLimit, controller.activate);
router.post("/auth/refresh", controller.refresh);
router.post("/auth/logout", controller.logout);

/**
 * @openapi
 * /api/v1/devices/register:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Register device public identity material
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeviceRegistrationRequest'
 *     responses:
 *       201: { description: Device registered }
 * /api/v1/devices:
 *   get:
 *     tags: [Mobile User Device Controller]
 *     summary: List active devices
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         description: Required for admin callers; mobile users default to their authenticated User ID.
 *         schema: { type: string }
 *       - in: query
 *         name: pageIndex
 *         required: false
 *         schema: { type: integer, minimum: 0, default: 0 }
 *       - in: query
 *         name: pageSize
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [ACTIVE, REVOKED, ALL]
 *           default: ACTIVE
 *     responses:
 *       200: { description: Devices fetched }
 *       400: { description: Invalid userId, pagination, or status }
 *       403: { description: Mobile user requested another user's devices }
 *       404: { description: Mobile user not found }
 * /api/v1/devices/{deviceId}:
 *   delete:
 *     tags: [Mobile User Device Controller]
 *     summary: Revoke a device
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Device revoked }
 */
router.post("/devices/register", rejectSensitive, controller.registerDevice);
router.get("/devices", deviceListAuth, controller.listDevices);
router.delete("/devices/:deviceId", deviceListAuth, controller.removeDevice);

/**
 * @openapi
 * /api/v1/keys/prekeys:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Upload signed and one-time public prekeys
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrekeyUploadRequest'
 *     responses:
 *       200: { description: Public prekeys uploaded }
 * /api/v1/keys/prekey-bundle/{userId}:
 *   get:
 *     tags: [Mobile User Device Controller]
 *     summary: Fetch public prekey bundles
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Public prekey bundles fetched }
 * /api/v1/keys/prekeys/replenish:
 *   post:
 *     tags: [Mobile User Device Controller]
 *     summary: Replenish one-time public prekeys
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PrekeyReplenishRequest'
 *     responses:
 *       200: { description: Public prekeys replenished }
 */
router.post("/keys/prekeys", auth, rejectSensitive, controller.uploadPrekeys);
router.get("/keys/prekey-bundle/:userId", auth, controller.getPrekeyBundle);
router.post("/keys/prekeys/replenish", auth, rejectSensitive, controller.replenishPrekeys);

module.exports = router;
