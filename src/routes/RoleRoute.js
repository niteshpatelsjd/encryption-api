// routes/roleRoutes.js
const express = require("express");
const router = express.Router();
const roleController = require("../controllers/RoleController");

/**
 * @openapi
 * tags:
 *   name: Role Controller
 *   description: Role management APIs
 */



/**
 * @openapi
 * /api/v1/role/addRole:
 *   post:
 *     tags: [Role Controller]
 *     summary: Add a new role with modules & permissions
 *     description: Creates a role along with its associated module permissions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "id"
 *               roleName:
 *                 type: string
 *                 example: "Admin"
 *               roleDescription:
 *                 type: string
 *                 example: "Administrator with full access"
 *               status:
 *                 type: integer
 *                 example: 1
 *               roleModuleRequestList:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "64f1e3f6a1b2c3d4e5f6g7h8"
 *                     moduleId:
 *                       type: string
 *                       example: "64f1e3f6a1b2c3d4e5f6g7h8"
 *                     moduleName:
 *                       type: string
 *                       example: "User Management"
 *                     parentModuleName:
 *                       type: string
 *                       example: "Administration"
 *                     moduleCode:
 *                       type: string
 *                       example: "USER_MGMT"
 *                     moduleAction:
 *                       type: integer
 *                       example: 1
 *                     addAction:
 *                       type: integer
 *                       example: 1
 *                     updateAction:
 *                       type: integer
 *                       example: 1
 *                     deleteAction:
 *                       type: integer
 *                       example: 0
 *                     downloadAction:
 *                       type: integer
 *                       example: 1
 *                     viewAction:
 *                       type: integer
 *                       example: 1
 *                     status:
 *                       type: integer
 *                       example: 1
 *     responses:
 *       201:
 *         description: Role created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role created successfully
 *                 data:
 *                   type: object
 */
router.post("/addRole", roleController.addRole);


/**
 * @openapi
 * /api/v1/role/getById:
 *   get:
 *     tags: [Role Controller]
 *     summary: Get role by ID
 *     parameters:
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Role details
 */
router.get("/getById", roleController.getRoleById);

/**
 * @openapi
 * /api/v1/role/getByName:
 *   get:
 *     tags: [Role Controller]
 *     summary: Get role by name
 *     parameters:
 *       - in: query
 *         name: roleName
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Role details
 */
router.get("/getByName", roleController.getRoleByName);

/**
 * @openapi
 * /api/v1/role/info:
 *   get:
 *     tags: [Role Controller]
 *     summary: Get detailed role info
 *     parameters:
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Role info with permissions
 */
router.get("/info", roleController.getRoleInfo);

/**
 * @openapi
 * /api/v1/role/getAllRole:
 *   get:
 *     tags: [Role Controller]
 *     summary: Get all roles with pagination, search, and status
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *         description: Page index (default 0)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Role status (active/inactive)
 *       - in: query
 *         name: searchText
 *         schema:
 *           type: string
 *         description: Search by role name
 *     responses:
 *       200:
 *         description: List of roles
 */
router.get("/getAllRole", roleController.getAllRoles);

/**
 * @openapi
 * /api/v1/role/blockUnblock:
 *   post:
 *     tags: [Role Controller]
 *     summary: Block or Unblock a role
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               status:
 *                 type: integer
 *               remark:
 *                 type: string 
 *     responses:
 *       200:
 *         description: Role status updated
 */
router.post("/blockUnblock", roleController.blockUnblockRole);

module.exports = router;
