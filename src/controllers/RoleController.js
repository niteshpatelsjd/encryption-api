// controllers/roleController.js
const roleService = require("../services/RoleService");

// Add Role
exports.addRole = async (req, res) => {
  try {
    const role = await roleService.addRole(req.body);
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Role By ID
exports.getRoleById = async (req, res) => {
  try {
    const role = await roleService.getRoleById(req.query.roleId);
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Role By Name
exports.getRoleByName = async (req, res) => {
  try {
    const role = await roleService.getRoleByName(req.query.roleName);
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Role Info
exports.getRoleInfo = async (req, res) => {
  try {
    const roleInfo = await roleService.getRoleById(req.query.roleId);
    res.json(roleInfo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get All Roles (with pagination, status, searchText)
exports.getAllRoles = async (req, res) => {
  try {
    const { pageIndex, pageSize, status, searchText } = req.query;
    const roles = await roleService.getAllRole(pageIndex, pageSize, status, searchText);
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Block/Unblock Role
exports.blockUnblockRole = async (req, res) => {
  try {
    const { id, status } = req.body;
    const updatedRole = await roleService.blockUnblockRole(id, status);
    res.json(updatedRole);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
