const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Device = require("../models/Device");
const DevicePrekey = require("../models/DevicePrekey");
const OneTimePrekey = require("../models/OneTimePrekey");
const RefreshToken = require("../models/RefreshToken");
const securityRepo = require("../repositories/SecurityRepository");
const buildResponse = require("../utils/response");
const { hashActivationCode, randomToken } = require("../utils/security");
const { ACTIVATION_CODE_TTL_HOURS } = require("../constants/SecurityConstants");

async function createMobileUser(body) {
  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  const mobileNumber = body?.mobileNumber?.trim();
  if (!name || !email || !mobileNumber) return buildResponse(400, "name, email and mobileNumber are required");
  if (await User.findOne({ $or: [{ email }, { mobileNumber }] })) return buildResponse(409, "Email or mobile number already exists");
  const password = await bcrypt.hash(randomToken(32), 12);
  const user = await User.create({ name, email, mobileNumber, countryCode: body.countryCode?.trim() || "", password, status: 1, isEmailVerified: true });
  return buildResponse(201, "Mobile user created", { userId: user._id, name: user.name, email: user.email, mobileNumber: user.mobileNumber });
}

async function generateSerial(userId, adminId) {
  const user = await User.findById(userId);
  if (!user) return buildResponse(404, "User not found");
  await require("../models/ActivationCode").updateMany({ userId, status: { $in: ["ACTIVE", "PENDING"] } }, { $set: { status: "REVOKED" } });
  const code = `ENC-${randomToken(18).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_HOURS * 3600000);
  await securityRepo.createActivation({ codeHash: hashActivationCode(code), codeHint: code.slice(-4), userId, expiresAt, createdBy: adminId || null });
  return buildResponse(201, "Activation code generated", { userId, serialId: code, expiresAt });
}

async function updateMobileUserStatus(body, context = {}) {
  const userId = typeof body?.id === "string" ? body.id.trim() : "";
  const status = Number(body?.status);
  if (!userId) {
    return buildResponse(400, "id is required");
  }
  if (![0, 1, 2].includes(status)) {
    return buildResponse(400, "status must be 0 (DELETED), 1 (ACTIVE), or 2 (BLOCKED)");
  }

  const user = await User.findById(userId);
  if (!user) return buildResponse(404, "Mobile user not found");
  if (user.status === status) {
    const unchangedMessages = {
      0: "Mobile user is already deleted",
      1: "Mobile user is already active",
      2: "Mobile user is already blocked"
    };
    return buildResponse(400, unchangedMessages[status]);
  }

  user.status = status;
  user.updatedAt = new Date();
  await user.save();

  if (status === 0 || status === 2) {
    const devices = await Device.find({ userId, status: "ACTIVE" }).select("deviceId").lean();
    const deviceIds = devices.map(device => device.deviceId);
    await Promise.all([
      Device.updateMany(
        { userId, status: "ACTIVE" },
        { $set: { status: "REVOKED", revokedAt: new Date() } }
      ),
      RefreshToken.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      ),
      DevicePrekey.deleteMany({ userId }),
      OneTimePrekey.deleteMany({ userId })
    ]);

    await securityRepo.logSecurityEvent({
      userId,
      type: status === 0 ? "MOBILE_USER_DELETED" : "MOBILE_USER_BLOCKED",
      outcome: "SUCCESS",
      metadata: {
        adminUserId: context.adminUserId || null,
        revokedDeviceCount: deviceIds.length,
        remark: body.remark?.trim().slice(0, 500) || null
      }
    });
  } else {
    await securityRepo.logSecurityEvent({
      userId,
      type: "MOBILE_USER_UNBLOCKED",
      outcome: "SUCCESS",
      metadata: {
        adminUserId: context.adminUserId || null,
        remark: body.remark?.trim().slice(0, 500) || null
      }
    });
  }

  const responseMessages = {
    0: "Mobile user deleted successfully",
    1: "Mobile user activated successfully",
    2: "Mobile user blocked successfully"
  };

  return buildResponse(200, responseMessages[status], {
    userId: user._id,
    status: user.status,
    statusName: status === 0 ? "DELETED" : status === 1 ? "ACTIVE" : "BLOCKED"
  });
}

module.exports = { createMobileUser, generateSerial, updateMobileUserStatus };
