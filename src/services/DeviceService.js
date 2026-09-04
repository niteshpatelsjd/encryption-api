const securityRepo = require("../repositories/SecurityRepository");
const activationService = require("./ActivationService");
const tokenService = require("./TokenService");
const RefreshToken = require("../models/RefreshToken");
const DevicePrekey = require("../models/DevicePrekey");
const OneTimePrekey = require("../models/OneTimePrekey");
const User = require("../models/User");
const buildResponse = require("../utils/response");
const { requireFields, validObjectId } = require("../validators/securityValidators");

async function register(body, context = {}) {
  const missing = requireFields(body, ["activationToken", "deviceId", "deviceType", "identityKey", "identityKeyAlgorithm"]);
  if (missing) return buildResponse(400, missing);
  const deviceType = body.deviceType.trim().toUpperCase();
  if (!["ANDROID", "IOS"].includes(deviceType)) return buildResponse(400, "deviceType must be ANDROID or IOS");

  let payload;
  try { payload = activationService.verifyActivationToken(body.activationToken); }
  catch (_error) { return buildResponse(401, "Invalid or expired activation token"); }

  const activation = await securityRepo.findActivationById(payload.activationId);
  if (!activation || activation.userId.toString() !== payload.userId || activation.status !== "PENDING" || activation.expiresAt <= new Date()) {
    return buildResponse(409, "Activation is no longer available");
  }

  const deviceId = body.deviceId.trim();
  const activeDevices = await securityRepo.findActiveDevices(payload.userId);
  const devicesToReplace = activeDevices.filter(item => item.deviceId !== deviceId);
  const activeDevice = devicesToReplace[0];
  if (activeDevice && body.replaceExistingDevice !== true) {
    return buildResponse(409, "Device replacement confirmation required", {
      code: "DEVICE_REPLACEMENT_CONFIRMATION_REQUIRED",
      activeDevice: {
        deviceId: activeDevice.deviceId,
        deviceType: activeDevice.deviceType,
        deviceName: activeDevice.deviceName || "Mobile device",
        lastSeenAt: activeDevice.lastSeenAt || null,
        registeredAt: activeDevice.createdAt || null
      }
    });
  }
  if (activeDevice && body.replacedDeviceId && !devicesToReplace.some(item => item.deviceId === body.replacedDeviceId)) {
    return buildResponse(409, "The active device changed. Confirm replacement again", {
      code: "ACTIVE_DEVICE_CHANGED",
      activeDevice
    });
  }
  const device = await securityRepo.registerDevice(payload.userId, {
    deviceId,
    deviceType,
    deviceName: body.deviceName?.trim() || "",
    identityKey: body.identityKey.trim(),
    identityKeyAlgorithm: body.identityKeyAlgorithm.trim(),
    registrationId: Number.isInteger(body.registrationId) ? body.registrationId : null
  });
  const consumed = await securityRepo.consumeActivation(payload.activationId, payload.userId, deviceId);
  if (!consumed) return buildResponse(409, "Activation code was already used");
  await User.updateOne({ _id: payload.userId }, { $set: { activeDeviceId: deviceId } });
  const replacedDeviceIds = devicesToReplace.map(item => item.deviceId);
  if (replacedDeviceIds.length) {
    await Promise.all([
      securityRepo.revokeOtherDevices(payload.userId, deviceId),
      RefreshToken.updateMany(
        { userId: payload.userId, deviceId: { $in: replacedDeviceIds }, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      ),
      DevicePrekey.deleteMany({ userId: payload.userId, deviceId: { $in: replacedDeviceIds } }),
      OneTimePrekey.deleteMany({ userId: payload.userId, deviceId: { $in: replacedDeviceIds } })
    ]);
  }
  const tokens = await tokenService.issueTokenPair(payload.userId, deviceId);
  await securityRepo.logSecurityEvent({ userId: payload.userId, deviceId, type: "DEVICE_REGISTERED", outcome: "SUCCESS", ipAddress: context.ip, metadata: { deviceType, identityKeyAlgorithm: device.identityKeyAlgorithm } });
  if (replacedDeviceIds.length) {
    const { disconnectDevice } = require("../socket/PresenceService");
    await Promise.all(replacedDeviceIds.map(replacedDeviceId => disconnectDevice(
      String(payload.userId),
      replacedDeviceId,
      { reason: "REPLACED_BY_NEW_DEVICE", replacementDevice: { deviceId, deviceType, deviceName: device.deviceName || "Mobile device" } }
    )));
    await securityRepo.logSecurityEvent({
      userId: payload.userId,
      deviceId,
      type: "DEVICE_REPLACED",
      outcome: "SUCCESS",
      ipAddress: context.ip,
      metadata: { replacedDeviceIds }
    });
  }
  return buildResponse(201, "Device registered", { userId: payload.userId, deviceId, ...tokens });
}

async function list({ requestedUserId, authenticatedUserId, isAdmin, pageIndex, pageSize, status }) {
  const userId = requestedUserId || authenticatedUserId;
  if (!userId) return buildResponse(400, "userId is required");
  if (!validObjectId(userId)) return buildResponse(400, "Invalid userId");
  if (!isAdmin && String(userId) !== String(authenticatedUserId)) {
    return buildResponse(403, "You can only view your own devices");
  }

  const userExists = await User.exists({ _id: userId, status: { $ne: 0 } });
  if (!userExists) return buildResponse(404, "Mobile user not found");

  pageIndex = Number.parseInt(pageIndex, 10);
  pageSize = Number.parseInt(pageSize, 10);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) pageIndex = 0;
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = 10;
  pageSize = Math.min(pageSize, 100);

  const normalizedStatus = typeof status === "string" ? status.trim().toUpperCase() : "ACTIVE";
  if (!["ACTIVE", "REVOKED", "ALL"].includes(normalizedStatus)) {
    return buildResponse(400, "status must be ACTIVE, REVOKED, or ALL");
  }

  const query = { userId };
  if (normalizedStatus !== "ALL") query.status = normalizedStatus;
  const skip = pageIndex * pageSize;

  const [content, totalRecords, totalActive, totalRevoked] = await Promise.all([
    securityRepo.listDevices(query, skip, pageSize),
    securityRepo.countDevices(query),
    securityRepo.countDevices({ userId, status: "ACTIVE" }),
    securityRepo.countDevices({ userId, status: "REVOKED" })
  ]);

  const totalPages = Math.ceil(totalRecords / pageSize);
  return buildResponse(200, "Devices fetched successfully", {
    content,
    userId,
    status: normalizedStatus,
    pageIndex,
    pageSize,
    totalRecords,
    totalActive,
    totalRevoked,
    totalPages,
    isLast: totalPages === 0 || pageIndex >= totalPages - 1,
    hasNext: pageIndex + 1 < totalPages,
    hasPrevious: pageIndex > 0
  });
}

async function remove(userId, deviceId) {
  const device = await securityRepo.revokeDevice(userId, deviceId);
  if (!device) return buildResponse(404, "Device not found");
  await Promise.all([
    RefreshToken.updateMany({ userId, deviceId, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    DevicePrekey.deleteOne({ userId, deviceId }),
    OneTimePrekey.deleteMany({ userId, deviceId }),
    securityRepo.logSecurityEvent({ userId, deviceId, type: "DEVICE_REVOKED", outcome: "SUCCESS" })
  ]);
  return buildResponse(200, "Device revoked");
}

module.exports = { register, list, remove };
