const RoleModule = require("../models/RoleModule");

/**
 * Create a new RoleModule
 */
async function createRoleModule(data) {
  return RoleModule.create(data);
}

/**
 * Find RoleModule by ID
 */
async function findById(id) {
  return RoleModule.findById(id);
}

/**
 * Find all RoleModules
 */
async function findAll(filter = {}, sort = { createdAt: -1 }) {
  return RoleModule.find(filter).sort(sort);
}

/**
 * Update RoleModule by ID
 */
async function updateById(id, updateData) {
  return RoleModule.findByIdAndUpdate(id, updateData, { new: true });
}

/**
 * Delete RoleModule by ID
 */
async function deleteById(id) {
  return RoleModule.findByIdAndDelete(id);
}

module.exports = {
  createRoleModule,
  findById,
  findAll,
  updateById,
  deleteById
};
