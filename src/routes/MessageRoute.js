const router = require("express").Router();
const controller = require("../controllers/MessageController");
const auth = require("../middleware/auth");

/**
 * @openapi
 * /api/v1/messages/sync:
 *   get:
 *     tags: [Messaging Controller]
 *     summary: Fetch pending encrypted envelopes for the authenticated device
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *       - in: query
 *         name: cursor
 *         description: Opaque nextCursor returned by the previous response.
 *         schema: { type: string }
 *     responses:
 *       200: { description: Pending encrypted messages fetched }
 *       400: { description: Invalid cursor }
 *       401: { description: Invalid user or device access token }
 */
router.get("/sync", auth, controller.sync);

module.exports = router;
