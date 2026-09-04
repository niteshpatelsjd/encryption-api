const securityRepo = require("../repositories/SecurityRepository");
const prekeyRepo = require("../repositories/PrekeyRepository");
const buildResponse = require("../utils/response");
const { validatePrekeys, validObjectId } = require("../validators/securityValidators");
const { MAX_ONE_TIME_PREKEYS, PREKEY_LOW_THRESHOLD } = require("../constants/SecurityConstants");

function uniqueKeys(keys = []) {
  return [...new Map(keys.map(key => [key.keyId, key])).values()];
}

function requestKeys(body) {
  return uniqueKeys(body.preKeys ?? body.oneTimePrekeys ?? []);
}

async function upload(userId, body) {
  const validation = validatePrekeys(body, true);
  if (validation) return buildResponse(400, validation);
  const device = await securityRepo.findActiveDevice(userId, body.deviceId);
  if (!device) return buildResponse(404, "Active device not found");
  const keys = requestKeys(body);
  if (keys.length > MAX_ONE_TIME_PREKEYS) return buildResponse(400, `A maximum of ${MAX_ONE_TIME_PREKEYS} one-time prekeys is allowed`);
  await prekeyRepo.upsertSignedPrekey(userId, body);
  await prekeyRepo.insertOneTimePrekeys(userId, body.deviceId, keys);
  const availablePreKeyCount = await prekeyRepo.countAvailable(userId, body.deviceId);
  return buildResponse(200, "Public prekeys uploaded", { deviceId: body.deviceId, availablePreKeyCount });
}

async function replenish(userId, body) {
  const validation = validatePrekeys(body, false);
  if (validation) return buildResponse(400, validation);
  const keys = requestKeys(body);
  if (!keys.length || keys.length > MAX_ONE_TIME_PREKEYS) return buildResponse(400, `Provide between 1 and ${MAX_ONE_TIME_PREKEYS} one-time prekeys`);
  const device = await securityRepo.findActiveDevice(userId, body.deviceId);
  if (!device) return buildResponse(404, "Active device not found");
  if (!await prekeyRepo.findSignedPrekey(userId, body.deviceId)) return buildResponse(404, "Upload the signed prekey bundle first");
  await prekeyRepo.insertOneTimePrekeys(userId, body.deviceId, keys);
  const availablePreKeyCount = await prekeyRepo.countAvailable(userId, body.deviceId);
  return buildResponse(200, "One-time public prekeys replenished", { deviceId: body.deviceId, availablePreKeyCount });
}

async function bundle(targetUserId, claimant) {
  if (!validObjectId(targetUserId)) return buildResponse(400, "Invalid userId");
  if (!claimant?.userId || !claimant?.deviceId) return buildResponse(401, "Authenticated device is required");
  const devices = await prekeyRepo.findActiveDevices(targetUserId);
  if (!devices.length) return buildResponse(404, "No active devices found");
  const deviceIds = devices.map(device => device.deviceId);
  const signedPrekeys = await prekeyRepo.findSignedPrekeys(targetUserId, deviceIds);
  const signedByDevice = new Map(signedPrekeys.map(prekey => [prekey.deviceId, prekey]));
  const eligibleDevices = devices.filter(device => signedByDevice.has(device.deviceId));
  if (!eligibleDevices.length) return buildResponse(404, "No prekey bundles available");
  const eligibleDeviceIds = eligibleDevices.map(device => device.deviceId);
  const claimedByDevice = new Map(await Promise.all(eligibleDevices.map(async device => [
    device.deviceId,
    await prekeyRepo.claimOneTimePrekey(targetUserId, device.deviceId, claimant)
  ])));
  const availableCounts = await prekeyRepo.countAvailableForDevices(targetUserId, eligibleDeviceIds);
  const bundles = eligibleDevices.map(device => {
    const signed = signedByDevice.get(device.deviceId);
    const claimed = claimedByDevice.get(device.deviceId);
    const availablePreKeyCount = availableCounts.get(device.deviceId) ?? 0;
    return {
      deviceId: device.deviceId,
      registrationId: device.registrationId,
      identityPublicKey: device.identityKey,
      identityKeyAlgorithm: device.identityKeyAlgorithm,
      signedPreKey: { keyId: signed.signedPrekey.keyId, publicKey: signed.signedPrekey.publicKey, signature: signed.signedPrekeySignature },
      oneTimePreKey: claimed ? { keyId: claimed.keyId, publicKey: claimed.publicKey } : null,
      availablePreKeyCount,
      preKeyLow: availablePreKeyCount < PREKEY_LOW_THRESHOLD
    };
  });
  return buildResponse(200, "Public prekey bundle fetched", { userId: targetUserId, devices: bundles });
}

module.exports = { upload, replenish, bundle };
