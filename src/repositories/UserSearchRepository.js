const mongoose = require("mongoose");
const User = require("../models/User");
const Device = require("../models/Device");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function search({ authenticatedUserId, query, limit, cursor }) {
  const filter = {
    status: 1,
    _id: {
      $ne: new mongoose.Types.ObjectId(authenticatedUserId),
      ...(cursor ? { $gt: new mongoose.Types.ObjectId(cursor.id) } : {})
    }
  };
  const searchConditions = [{ name: { $regex: escapeRegex(query), $options: "i" } }];
  if (/^\+?\d{7,15}$/.test(query)) searchConditions.push({ mobileNumber: query });
  filter.$or = searchConditions;

  return User.aggregate([
    { $match: filter },
    { $sort: { _id: 1 } },
    { $lookup: {
      from: Device.collection.name,
      let: { userId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$userId", "$$userId"] }, status: "ACTIVE" } },
        { $limit: 1 },
        { $project: { _id: 1 } }
      ],
      as: "registeredDevices"
    } },
    { $match: { "registeredDevices.0": { $exists: true } } },
    { $limit: limit + 1 },
    { $project: { _id: 1, name: 1, profileImageKey: 1, profileUrl: 1 } }
  ]);
}

module.exports = { search, escapeRegex };
