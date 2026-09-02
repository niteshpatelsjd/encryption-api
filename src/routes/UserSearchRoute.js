const router = require("express").Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/UserSearchController");
const preferenceController = require("../controllers/UserPreferenceController");

/**
 * @openapi
 * /api/v1/users/search:
 *   get:
 *     tags: [Mobile User Search]
 *     summary: Search active mobile users
 *     description: Returns a safe user allowlist and excludes the authenticated user.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2, maxLength: 100 }
 *         description: Case-insensitive name search; an exact mobile number is also accepted.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *       - in: query
 *         name: cursor
 *         description: Opaque nextCursor returned by the previous response.
 *         schema: { type: string }
 *     responses:
 *       200: { description: Users fetched successfully }
 *       400: { description: Invalid query or cursor }
 *       401: { description: Authentication required }
 */
router.get("/search", auth, controller.search);
router.get("/preferences", auth, preferenceController.get);
router.patch("/preferences/disappearing-messages", auth, preferenceController.updateDisappearingMessages);

module.exports = router;
