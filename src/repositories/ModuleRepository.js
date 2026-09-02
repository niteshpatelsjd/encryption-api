const Module = require("../models/Module");

// 🔍 Find by ID
async function findById(id) {
  return await Module.findById(id);
}

// 📌 Save or Update
async function save(module) {
  return await module.save();
}

// 📌 Find all (with sort)
async function findAll(sort = { createdAt: -1 }) {
  return await Module.find().sort(sort);
}

// 📌 Search with pagination
async function findBySearchTextWithPagination(searchText, pageIndex, pageSize) {
  const query = {
    $or: [
      { moduleName: new RegExp(searchText, "i") },
      { moduleCode: new RegExp(searchText, "i") },
      { parentModuleName: new RegExp(searchText, "i") }
    ]
  };
  const skip = pageIndex * pageSize;
  const data = await Module.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);
  const total = await Module.countDocuments(query);

  return { data, total };
}

// 📌 Search without pagination
async function findBySearchText(searchText, sort = { createdAt: -1 }) {
  const query = {
    $or: [
      { moduleName: new RegExp(searchText, "i") },
      { moduleCode: new RegExp(searchText, "i") },
      { parentModuleName: new RegExp(searchText, "i") }
    ]
  };
  return await Module.find(query).sort(sort);
}

module.exports = {
  findById,
  save,
  findAll,
  findBySearchTextWithPagination,
  findBySearchText
};
