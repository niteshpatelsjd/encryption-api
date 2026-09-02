const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/ModuleController");

/**
 * @openapi
 * tags:
 *   name: Module Controller
 *   description: Module management APIs
 */

/**
 * @openapi
 * /api/v1/module/addModule:
 *   post:
 *     tags: [Module Controller]
 *     summary: Create or Update Module
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
 *               moduleName:
 *                 type: string
 *               moduleCode:
 *                 type: string
 *               parentModuleName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Module created/updated
 *       404:
 *         description: Module not found
 *       500:
 *         description: Server error
 */
router.post("/addModule", ctrl.addModule);

/**
 * @openapi
 * /api/v1/module/getAllModule:
 *   get:
 *     tags: [Module Controller]
 *     summary: Get list of all modules (with pagination & search)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *         description: Page index (starting from 0)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *       - in: query
 *         name: searchText
 *         schema:
 *           type: string
 *         description: Search by moduleName/moduleCode/parentModuleName
 *     responses:
 *       200:
 *         description: Module list
 *       404:
 *         description: No records found
 *       500:
 *         description: Server error
 */
router.get("/getAllModule", ctrl.getAllModule);

module.exports = router;
