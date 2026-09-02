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
const findActiveDevices = userId => Device.find({ userId, status: "ACTIVE" }).lean();
const countAvailable = (userId, deviceId) => OneTimePrekey.countDocuments({ userId, deviceId, status: "AVAILABLE" });

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
  findActiveDevices,
  countAvailable,
  claimOneTimePrekey,
  deleteForDevice,
  deleteForUser
};
