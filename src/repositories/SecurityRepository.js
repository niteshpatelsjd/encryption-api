const ActivationCode = require("../models/ActivationCode");
const Device = require("../models/Device");
const SecurityEvent = require("../models/SecurityEvent");

const createActivation = data => ActivationCode.create(data);
const findActivation = codeHash => ActivationCode.findOne({ codeHash }).populate("userId");
const findActivationById = id => ActivationCode.findById(id);
const setActivationPending = id => ActivationCode.findOneAndUpdate({ _id: id, status: { $in: ["ACTIVE", "PENDING"] }, expiresAt: { $gt: new Date() } }, { $set: { status: "PENDING" } }, { new: true });
const consumeActivation = (id, userId, deviceId) => ActivationCode.findOneAndUpdate({ _id: id, userId, status: "PENDING", expiresAt: { $gt: new Date() } }, { $set: { status: "USED", usedAt: new Date(), usedByDeviceId: deviceId } }, { new: true });
const registerDevice = (userId, data) => Device.findOneAndUpdate({ userId, deviceId: data.deviceId }, { $set: { ...data, userId, status: "ACTIVE", revokedAt: null, lastSeenAt: new Date() } }, { upsert: true, new: true, runValidators: true });
const listDevices = (query, skip, limit) => Device.find(query)
  .select("-identityKey")
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .lean();
const countDevices = query => Device.countDocuments(query);
const revokeDevice = (userId, deviceId) => Device.findOneAndUpdate({ userId, deviceId, status: "ACTIVE" }, { $set: { status: "REVOKED", revokedAt: new Date() } }, { new: true });
const findActiveDevices = userId => Device.find({ userId, status: "ACTIVE" })
  .select("deviceId deviceType deviceName lastSeenAt createdAt updatedAt")
  .sort({ lastSeenAt: -1, createdAt: -1 })
  .lean();
const revokeOtherDevices = (userId, deviceId) => Device.updateMany(
  { userId, deviceId: { $ne: deviceId }, status: "ACTIVE" },
  { $set: { status: "REVOKED", revokedAt: new Date() } }
);
const findActiveDevice = (userId, deviceId) => Device.findOne({ userId, deviceId, status: "ACTIVE" });
const logSecurityEvent = data => SecurityEvent.create(data).catch(() => null);

module.exports = { createActivation, findActivation, findActivationById, setActivationPending, consumeActivation, registerDevice, listDevices, countDevices, revokeDevice, findActiveDevices, revokeOtherDevices, findActiveDevice, logSecurityEvent };
