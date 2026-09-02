const router = require("express").Router();
const controller = require("../controllers/ConversationController");
const auth = require("../middleware/auth");
const messageController = require("../controllers/MessageController");

/**
 * @openapi
 * /api/v1/conversations:
 *   post:
 *     tags: [Conversation Controller]
 *     summary: Create or retrieve a direct conversation
 *     description: Idempotently returns the single direct conversation for the authenticated user and participant.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participantUserId]
 *             properties:
 *               participantUserId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200: { description: Conversation retrieved successfully }
 *       400: { description: Invalid participant }
 *       404: { description: Participant not found or inactive }
 *   get:
 *     tags: [Conversation Controller]
 *     summary: List the authenticated user's conversations
 *     description: Uses an opaque cursor and sorts by latest conversation activity.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *       - in: query
 *         name: cursor
 *         required: false
 *         description: Opaque nextCursor returned by the previous response.
 *         schema: { type: string }
 *     responses:
 *       200: { description: Conversations fetched successfully }
 *       400: { description: Invalid cursor }
 */
router.post("/", auth, controller.create);
router.get("/", auth, controller.list);
router.delete("/:conversationId", auth, controller.remove);

/**
 * @openapi
 * /api/v1/conversations/{conversationId}/messages:
 *   get:
 *     tags: [Messaging Controller]
 *     summary: Fetch encrypted conversation history for the authenticated device
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 30 }
 *       - in: query
 *         name: before
 *         description: Opaque nextCursor returned by the previous response.
 *         schema: { type: string }
 *     responses:
 *       200: { description: Encrypted message history fetched }
 *       403: { description: User is not a conversation member }
 */
router.get("/:conversationId/messages", auth, messageController.history);

module.exports = router;
