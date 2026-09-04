const Device = require("../models/Device");
const DevicePrekey = require("../models/DevicePrekey");
const OneTimePrekey = require("../models/OneTimePrekey");

const upsertSignedPrekey = (userId, data) => DevicePrekey.findOneAndUpdate(
  { userId, deviceId: data.deviceId },
  { $set: { signedPrekey: data.signedPrekey, signedPrekeySignature: data.signedPrekeySignature } },
  { upsert: true, new: true, runValidators: true }
);

async function insertOneTimePrekeys(userId, deviceId, keys) {
  if (!keys.length) return;
  await OneTimePrekey.bulkWrite(keys.map(key => ({
    updateOne: {
      filter: { deviceId, keyId: key.keyId },
      update: { $setOnInsert: { userId, deviceId, keyId: key.keyId, publicKey: key.publicKey, status: "AVAILABLE" } },
      upsert: true
    }
  })), { ordered: false });
}

const findSignedPrekey = (userId, deviceId) => DevicePrekey.findOne({ userId, deviceId }).lean();
const findSignedPrekeys = (userId, deviceIds) => DevicePrekey.find({ userId, deviceId: { $in: deviceIds } }).lean();
const findActiveDevices = userId => Device.find({ userId, status: "ACTIVE" })
  .select("deviceId registrationId identityKey identityKeyAlgorithm")
  .lean();
const countAvailable = (userId, deviceId) => OneTimePrekey.countDocuments({ userId, deviceId, status: "AVAILABLE" });
const countAvailableForDevices = async (userId, deviceIds) => {
  const counts = await OneTimePrekey.aggregate([
    { $match: { userId, deviceId: { $in: deviceIds }, status: "AVAILABLE" } },
    { $group: { _id: "$deviceId", count: { $sum: 1 } } }
  ]);
  return new Map(counts.map(item => [item._id, item.count]));
};

const claimOneTimePrekey = (userId, deviceId, claimant) => OneTimePrekey.findOneAndUpdate(
  { userId, deviceId, status: "AVAILABLE" },
  { $set: {
    status: "CLAIMED",
    claimedAt: new Date(),
    claimedByUserId: claimant.userId,
    claimedByDeviceId: claimant.deviceId
  } },
  { sort: { keyId: 1 }, new: true }
).lean();

const deleteForDevice = (userId, deviceId) => OneTimePrekey.deleteMany({ userId, deviceId });
const deleteForUser = userId => OneTimePrekey.deleteMany({ userId });

module.exports = {
  upsertSignedPrekey,
  insertOneTimePrekeys,
  findSignedPrekey,
  findSignedPrekeys,
  findActiveDevices,
  countAvailable,
  countAvailableForDevices,
  claimOneTimePrekey,
  deleteForDevice,
  deleteForUser
};
