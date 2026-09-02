const Notification = require("../models/Notification");
const mongoose = require("mongoose");

async function findById(id) {
  return Notification.findById(id);
}

async function save(notification) {
  return notification.save();
}

async function updateMany(query, update) {
  return Notification.updateMany(query, update);
}

async function findAll(query, skip, limit) {
  return Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
}

async function countDocuments(query) {
  return Notification.countDocuments(query);
}

async function distinctTypes(query = { status: { $ne: 0 } }) {
  return Notification.distinct("type", query);
}

async function findUpcomingEventsByOrganizationId(organizationId, currentDate) {
  return Notification.aggregate([
    {
      $match: {
        type: "EVENT",
        status: { $ne: 0 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.organizationId": new mongoose.Types.ObjectId(organizationId),
      },
    },
    {
      $addFields: {
        eventDateValue: {
          $convert: {
            input: {
              $ifNull: [
                "$data.eventDate",
                {
                  $ifNull: [
                    "$data.eventStartDate",
                    {
                      $ifNull: ["$data.startDate", "$data.date"],
                    },
                  ],
                },
              ],
            },
            to: "date",
            onError: null,
            onNull: null,
          },
        },
      },
    },
    {
      $match: {
        eventDateValue: { $gte: currentDate },
      },
    },
    { $sort: { eventDateValue: 1, createdAt: -1 } },
  ]);
}

module.exports = {
  findById,
  save,
  updateMany,
  findAll,
  countDocuments,
  distinctTypes,
  findUpcomingEventsByOrganizationId,
};
