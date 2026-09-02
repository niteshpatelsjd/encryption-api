// services/RoleService.js
const Role = require("../models/Role");
const RoleModule = require("../models/RoleModule");
const Module = require("../models/Module");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

// ✅ Response Builders
const {
  buildRoleResponse,
} = require("../utils/ResponseBuilder");

const DataConstant = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  NO_CONTENT: 204,
  SERVER_ERROR: 500,

  SHORT_ZERO: 0,
  SHORT_ONE: 1,
  SHORT_TWO: 2,

  ROLE_CREATED: "Role created successfully",
  ROLE_UPDATED: "Role updated successfully",
  ROLE_DELETED: "Role deleted successfully",
  ROLE_ACTIVE: "Role activated successfully",
  ROLE_INACTIVE: "Role inactivated successfully",
  ROLE_NOT_FOUND: "Role not found",
  ROLE_MODULE_NOT_FOUND: "RoleModule not found",
  MODULE_NOT_FOUND: "Module not found",
  ROLE_BAD_REQUEST: "Invalid Role request",
  RECORD_FOUND: "Record found",
  RECORD_NOT_FOUND: "No records found",
  PAGINATION_REQUIRED: "Pagination params are required",
  SERVER_MESSAGE: "Internal Server Error",
  ROLE_ALREADY_ACTIVE: "Role is already active",
  ROLE_ALREADY_INACTIVE: "Role is already inactive",
  INVALID_REQUEST: "Invalid request"
};

// ✅ Add or update role
async function addRole(roleRequest) {
  try {
    let role;

    // 🔄 Update Role
    if (roleRequest.id) {
      logger.info("Updating role with id: %s", roleRequest.id);
      role = await Role.findById(roleRequest.id).populate("roleModuleList");

      if (!role) {
        return buildResponse(DataConstant.NOT_FOUND, DataConstant.ROLE_NOT_FOUND);
      }

      if (!roleRequest.roleModuleRequestList?.length) {
        return buildResponse(DataConstant.BAD_REQUEST, DataConstant.ROLE_BAD_REQUEST);
      }

      role.roleName = roleRequest.roleName;
      role.roleDescription = roleRequest.roleDescription;
      role.updatedAt = new Date();

      const roleModuleList = [];
      for (const req of roleRequest.roleModuleRequestList) {
        if (req.id) {
          let roleModule = await RoleModule.findById(req.id);
          if (!roleModule) {
            return buildResponse(DataConstant.NOT_FOUND, DataConstant.ROLE_MODULE_NOT_FOUND);
          }

          Object.assign(roleModule, {
            moduleName: req.moduleName,
            moduleCode: req.moduleCode,
            parentModuleName: req.parentModuleName,
            moduleAction: req.moduleAction,
            addAction: req.addAction,
            updateAction: req.updateAction,
            deleteAction: req.deleteAction,
            viewAction: req.viewAction,
            downloadAction: req.downloadAction,
            updatedAt: new Date()
          });
          await roleModule.save();
          roleModuleList.push(roleModule);
        } else {
          if (!req.moduleId) {
            return buildResponse(DataConstant.BAD_REQUEST, DataConstant.MODULE_NOT_FOUND);
          }

          const module = await Module.findById(req.moduleId);
          if (!module) {
            return buildResponse(DataConstant.BAD_REQUEST, DataConstant.MODULE_NOT_FOUND);
          }

          const roleModule = await RoleModule.create({
            roleId: role._id,
            moduleId: module._id,
            moduleName: module.moduleName,
            moduleCode: module.moduleCode,
            parentModuleName: module.parentModuleName,
            moduleAction: req.moduleAction,
            addAction: req.addAction,
            updateAction: req.updateAction,
            deleteAction: req.deleteAction,
            viewAction: req.viewAction,
            downloadAction: req.downloadAction,
            status: DataConstant.SHORT_ONE,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          roleModuleList.push(roleModule);
        }
      }

      role.roleModuleList = roleModuleList.map(rm => rm._id);
      await role.save();
      await role.populate("roleModuleList");

      return buildResponse(DataConstant.OK, DataConstant.ROLE_UPDATED, buildRoleResponse(role));
    }

    // ➕ Create Role
    logger.info("Creating new role with name: %s", roleRequest.roleName);

    if (!roleRequest.roleModuleRequestList?.length) {
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.ROLE_BAD_REQUEST);
    }

    role = await Role.create({
      roleName: roleRequest.roleName,
      roleDescription: roleRequest.roleDescription,
      status: DataConstant.SHORT_ONE,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const roleModuleList = [];
    for (const req of roleRequest.roleModuleRequestList) {
      if (!req.moduleId) {
        return buildResponse(DataConstant.BAD_REQUEST, DataConstant.MODULE_NOT_FOUND);
      }

      const module = await Module.findById(req.moduleId);
      if (!module) {
        return buildResponse(DataConstant.BAD_REQUEST, DataConstant.MODULE_NOT_FOUND);
      }

      const roleModule = await RoleModule.create({
        roleId: role._id,
        moduleId: module._id,
        moduleName: req.moduleName ?? module.moduleName,
        moduleCode: req.moduleCode ?? module.moduleCode,
        parentModuleName: req.parentModuleName ?? module.parentModuleName,
        moduleAction: req.moduleAction,
        addAction: req.addAction,
        updateAction: req.updateAction,
        deleteAction: req.deleteAction,
        viewAction: req.viewAction,
        downloadAction: req.downloadAction,
        status: DataConstant.SHORT_ONE,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      roleModuleList.push(roleModule);
    }

    role.roleModuleList = roleModuleList.map(rm => rm._id);
    await role.save();
    await role.populate("roleModuleList");

    return buildResponse(DataConstant.OK, DataConstant.ROLE_CREATED, buildRoleResponse(role));
  } catch (err) {
    logger.error("Error in addRole: %s", err.stack || err.message);
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

// ✅ Get all roles (with pagination & filters)
async function getAllRole(pageIndex, pageSize, status, searchText) {
  try {


    let query = {
    status: { $in: [DataConstant.SHORT_ONE, DataConstant.SHORT_TWO] },
    };

    // Convert status to integer if it’s a string
    if (status !== undefined && status !== null && status !== "") {
      const parsedStatus = parseInt(status, 10);
      if (!isNaN(parsedStatus)) {
        query.status = parsedStatus;
      }
    }
        // Search by soundUrl (contains)
    if (searchText && searchText.trim() !== "") {
      query.roleName = { $regex: searchText.trim(), $options: "i" };
    }

    const skip = pageIndex * pageSize;
    const [data, total] = await Promise.all([
      Role.find(query).populate("roleModuleList").sort({ createdAt: -1 }).skip(skip).limit(pageSize),
      Role.countDocuments(query)
    ]);

    if (!data.length) {
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.RECORD_NOT_FOUND);
    }

    return buildResponse(DataConstant.OK, DataConstant.RECORD_FOUND, {
      content: data.map(buildRoleResponse),
      pageIndex,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: skip + data.length < total,
      hasPrevious: pageIndex > 0
    });
  } catch (err) {
    logger.error("Error in getAllRole: %s", err.stack || err.message);
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

// ✅ Get role by ID
async function getRoleById(roleId) {
  try {
    const role = await Role.findById(roleId).populate("roleModuleList");
    if (!role) {
      return buildResponse(DataConstant.NO_CONTENT, DataConstant.RECORD_NOT_FOUND);
    }
    return buildResponse(DataConstant.OK, DataConstant.RECORD_FOUND, buildRoleResponse(role));
  } catch (err) {
    logger.error("Error in getRoleById: %s", err.stack || err.message);
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

// ✅ Get role by name
async function getRoleByName(roleName) {
  try {
    const role = await Role.findOne({ roleName }).populate("roleModuleList");
    if (!role) {
      return buildResponse(DataConstant.NO_CONTENT, DataConstant.RECORD_NOT_FOUND);
    }
    return buildResponse(DataConstant.OK, DataConstant.RECORD_FOUND, buildRoleResponse(role));
  } catch (err) {
    logger.error("Error in getRoleByName: %s", err.stack || err.message);
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

// ✅ Block/Unblock/Delete Role

async function blockUnblockRole(roleId, status) {
  try {
    const role = await Role.findById(roleId).populate("roleModuleList");
    if (!role) {
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.RECORD_NOT_FOUND);
    }

    if (role.status === status) {
      if (status === DataConstant.SHORT_ONE) {
        return buildResponse(DataConstant.BAD_REQUEST, DataConstant.ROLE_ALREADY_ACTIVE);
      }
      if (status === DataConstant.SHORT_TWO) {
        return buildResponse(DataConstant.BAD_REQUEST, DataConstant.ROLE_ALREADY_INACTIVE);
      }
    }

    role.status = status;
    await role.save();

    let message = DataConstant.INVALID_REQUEST;
    if (status === DataConstant.SHORT_ZERO) message = DataConstant.ROLE_DELETED;
    if (status === DataConstant.SHORT_ONE) message = DataConstant.ROLE_ACTIVE;
    if (status === DataConstant.SHORT_TWO) message = DataConstant.ROLE_INACTIVE;

    return buildResponse(DataConstant.OK, message, buildRoleResponse(role));
  } catch (err) {
    logger.error("Error in blockUnblockRole: %s", err.stack || err.message);
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

module.exports = {
  addRole,
  getAllRole,
  getRoleById,
  getRoleByName,
  blockUnblockRole
};
