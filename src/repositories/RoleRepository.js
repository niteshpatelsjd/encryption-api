const Role = require("../models/Role");

/**
 * Find roles by search text with pagination
 */
async function findBySearchTextWithPagination(searchText, pageIndex = 0, pageSize = 10) {
  const query = {
    $and: [
      { status: { $in: [1, 2] } },
      { roleName: { $regex: searchText, $options: "i" } }
    ]
  };

  const roles = await Role.find(query)
    .skip(pageIndex * pageSize)
    .limit(pageSize)
    .sort({ createdAt: -1 }); // default sorting (like Pageable Sort)

  const total = await Role.countDocuments(query);

  return { data: roles, total, pageIndex, pageSize };
}

/**
 * Find roles by search text (with sorting)
 */
async function findBySearchText(searchText, sort = { createdAt: -1 }) {
  const query = {
    $and: [
      { status: { $in: [1, 2] } },
      { roleName: { $regex: searchText, $options: "i" } }
    ]
  };
  return Role.find(query).sort(sort);
}

/**
 * Find by exact roleName
 */
async function findByRoleName(name) {
  return Role.findOne({ roleName: name });
}

/**
 * Find roles by searchText + status with pagination
 */
async function findBySearchTextAndStatusWithPagination(searchText, status, pageIndex = 0, pageSize = 10) {
  const query = {
    roleName: { $regex: searchText, $options: "i" },
    status
  };

  const roles = await Role.find(query)
    .skip(pageIndex * pageSize)
    .limit(pageSize)
    .sort({ createdAt: -1 });

  const total = await Role.countDocuments(query);

  return { data: roles, total, pageIndex, pageSize };
}

/**
 * Find all roles by status with pagination
 */
async function findAllByStatus(status, pageIndex = 0, pageSize = 10) {
  const query = { status };

  const roles = await Role.find(query)
    .skip(pageIndex * pageSize)
    .limit(pageSize)
    .sort({ createdAt: -1 });

  const total = await Role.countDocuments(query);

  return { data: roles, total, pageIndex, pageSize };
}

/**
 * Find all roles where status != 0 (with pagination)
 */
async function findAllByStatusNotZero(pageIndex = 0, pageSize = 10) {
  const query = { status: { $ne: 0 } };

  const roles = await Role.find(query)
    .skip(pageIndex * pageSize)
    .limit(pageSize)
    .sort({ createdAt: -1 });

  const total = await Role.countDocuments(query);

  return { data: roles, total, pageIndex, pageSize };
}

module.exports = {
  findBySearchTextWithPagination,
  findBySearchText,
  findByRoleName,
  findBySearchTextAndStatusWithPagination,
  findAllByStatus,
  findAllByStatusNotZero
};
