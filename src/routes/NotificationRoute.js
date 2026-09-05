const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/NotificationController");
const mobileNotificationController = require("../controllers/MobileNotificationController");
const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const multer = require("multer");
// Multer setup (memory storage so we can pass buffer to fileUtil)
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get("/me", auth, mobileNotificationController.list);
router.patch("/read-all", auth, mobileNotificationController.markAllRead);
router.patch("/:id/read", auth, mobileNotificationController.markRead);
router.delete("/:id", auth, mobileNotificationController.remove);
/**
 * @openapi
 * tags:
 *   name: Notification Controller
 *   description: Notification management APIs
 */

/**
 * @openapi
 * /api/v1/notification/create:
 *   post:
 *     tags: [Notification Controller]
 *     summary: Create and send notification
 *     security:
 *       - bearerAuth: []
 *
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *
 *               userId:
 *                 type: string
 *                 description: User ID who will receive the notification. Required unless organizationId is supplied.
 *                 example: "68a123456789abcdef123456"
 *
 *               organizationId:
 *                 type: string
 *                 nullable: true
 *                 description: When supplied without userId, sends the notification to all approved organization members.
 *                 example: "68a123456789abcdef123456"
 *
 *               title:
 *                 type: string
 *                 example: "Organization Membership Approved"
 *
 *               message:
 *                 type: string
 *                 example: "Your request to join the organization has been approved."
 *
 *               type:
 *                 type: string
 *                 enum:
 *                   - SYSTEM
 *                   - GENERAL
 *                   - EVENT
 *                   - ANNOUNCEMENT
 *                   - ALERT
 *                 example: SYSTEM
 *
 *               data:
 *                 type: string
 *                 description: JSON string containing additional notification data
 *                 example: '{"screen":"organization","organizationId":"68a123456789abcdef123456"}'
 *
 *               imageFile:
 *                 type: string
 *                 format: binary
 *                 description: Optional notification image
 *
 *     responses:
 *       201:
 *         description: Notification created successfully
 *
 *       400:
 *         description: Bad request
 *
 *       404:
 *         description: User not found
 *
 *       500:
 *         description: Server error
 */

router.post(
  "/create",
  upload.fields([
    {
      name: "imageFile",
      maxCount: 1
    }
  ]),
  adminAuth,
  notificationController.createNotification
);

/**
 * @openapi
 * /api/v1/notification/markRead:
 *   post:
 *     tags: [Notification Controller]
 *     summary: Mark notification as read
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.post("/markRead", adminAuth, notificationController.markRead);

/**
 * @openapi
 * /api/v1/notification/markAllRead:
 *   post:
 *     tags: [Notification Controller]
 *     summary: Mark all user notifications as read
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.post("/markAllRead", adminAuth, notificationController.markAllRead);

/**
 * @openapi
 * /api/v1/notification/getById:
 *   get:
 *     tags: [Notification Controller]
 *     summary: Get notification by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Notification details
 */
router.get("/getById", adminAuth, notificationController.getById);

/**
 * @openapi
 * /api/v1/notification/getAll:
 *   get:
 *     tags: [Notification Controller]
 *     summary: Get all notifications with pagination, search, and type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: searchText
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [SYSTEM, GENERAL, EVENT, ANNOUNCEMENT, ALERT]
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification list
 */
router.get("/getAll", adminAuth, notificationController.getAll);

/**
 * @openapi
 * /api/v1/notification/getAllNotification:
 *   get:
 *     tags: [Notification Controller]
 *     summary: Get notifications with organization details
 *     description: Uses the same filters and pagination as getAll, and adds an organization object for each notification.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: searchText
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [SYSTEM, GENERAL, EVENT, ANNOUNCEMENT, ALERT] }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification list with organization details
 */
router.get("/getAllNotification", adminAuth, notificationController.getAllNotification);

/**
 * @openapi
 * /api/v1/notification/getAllEvents:
 *   get:
 *     tags: [Notification Controller]
 *     summary: Get all notification event types
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Event type list
 */
router.get("/getAllEvents", adminAuth, notificationController.getAllEvents);

/**
 * @openapi
 * /api/v1/notification/getUpcomingEvents:
 *   get:
 *     tags: [Notification Controller]
 *     summary: Get upcoming event notifications by organization ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Upcoming event notifications
 */
router.get("/getUpcomingEvents", adminAuth, notificationController.getUpcomingEvents);

module.exports = router;
