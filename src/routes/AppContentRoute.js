const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/ContentController");

/**
 * @openapi
 * /api/v1/content/getContent:
 *   get:
 *     tags: [App Content Controller]
 *     summary: Get content by type (privacy policy, terms & conditions, about us)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [privacy_policy, terms_conditions, about_us]
 *         description: Type of content to fetch
 *       - in: query
 *         name: lang
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar]
 *         description: Choose the content language
 *     responses:
 *       200:
 *         description: Content fetched successfully
 *       404:
 *         description: Content not found
 *       500:
 *         description: Internal server error
 */
router.get("/getContent", ctrl.getContent);

/**
 * @openapi
 * /api/v1/content/updateContent:
 *   post:
 *     tags: [App Content Controller]
 *     summary: Create or update app content (Privacy Policy, Terms & Conditions, About Us)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - content
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [privacy_policy, terms_conditions, about_us]
 *                 description: Type of content to create or update
 *                 example: privacy_policy
 *               lang:
 *                 type: string
 *                 enum: [en, ar]
 *                 description: Choose the language english/arabic
 *                 example: en
 *               content:
 *                 type: string
 *                 description: Main body of the content (HTML or text)
 *                 example: "This privacy policy explains how we handle your data..."
 *     responses:
 *       200:
 *         description: Content created or updated successfully
 *       400:
 *         description: Invalid or missing parameters
 *       500:
 *         description: Internal server error
 */
router.post("/updateContent", ctrl.updateContent);

module.exports = router;
