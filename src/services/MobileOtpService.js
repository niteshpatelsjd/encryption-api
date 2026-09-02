const crypto = require("crypto");
const redis = require("../config/RedisConfig");
const User = require("../models/User");
const securityRepo = require("../repositories/SecurityRepository");
const buildResponse = require("../utils/response");
const { buildAppUserResponse } = require("../utils/ResponseBuilder");

const OTP_TTL_SECONDS = 5 * 60;
const OTP_REQUEST_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

function normalizeMobileNumber(value) {
  return typeof value === "string" ? value.trim() : "";
}

function otpDigest(otp, mobileNumber) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("OTP_SECRET or JWT_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update(`${mobileNumber}:${otp}`).digest("hex");
}

async function requestOtp(body) {
  const mobileNumber = normalizeMobileNumber(body?.mobileNumber);
  if (!mobileNumber) return buildResponse(400, "mobileNumber is required");

  const user = await User.findOne({ mobileNumber });
  if (!user) {
    return buildResponse(
      404,
      "No mobile number found. Please contact admin"
    );
  }
  if (user.status !== 1) return buildResponse(403, "Mobile user is blocked or unavailable");

  const cooldownKey = `mobile_otp_cooldown:${user._id}`;
 

  const otp = crypto.randomInt(1000, 10000).toString();
  await redis
    .multi()
    .set(`mobile_otp:${user._id}`, otpDigest(otp, mobileNumber), "EX", OTP_TTL_SECONDS)
    .del(`mobile_otp_attempts:${user._id}`)
    .exec();

  const responseBody = {
    mobileNumber,
    otp,
    expiresInSeconds: OTP_TTL_SECONDS
  };

  return buildResponse(200, "OTP generated successfully", responseBody);
}

async function verifyOtp(body, context = {}) {
  const mobileNumber = normalizeMobileNumber(body?.mobileNumber);
  const otp = typeof body?.OTP === "string"
    ? body.OTP.trim()
    : typeof body?.otp === "string"
      ? body.otp.trim()
      : "";
  const deviceToken = typeof body?.deviceToken === "string" ? body.deviceToken.trim() : "";
  const deviceType = typeof body?.deviceType === "string" ? body.deviceType.trim().toUpperCase() : "";

  if (!mobileNumber || !otp || !deviceToken || !deviceType) {
    return buildResponse(400, "OTP, mobileNumber, deviceToken and deviceType are required");
  }
  if (!/^\d{4}$/.test(otp)) return buildResponse(400, "OTP must be exactly 4 digits");
  if (!["ANDROID", "IOS"].includes(deviceType)) return buildResponse(400, "deviceType must be ANDROID or IOS");

  const user = await User.findOne({ mobileNumber });
  if (!user) return buildResponse(404, "Mobile user not found");
  if (user.status !== 1) return buildResponse(403, "Mobile user is blocked or unavailable");

  const attemptsKey = `mobile_otp_attempts:${user._id}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    await redis.del(`mobile_otp:${user._id}`);
    return buildResponse(429, "Too many invalid OTP attempts. Request a new OTP");
  }

  const storedDigest = await redis.get(`mobile_otp:${user._id}`);
  const suppliedDigest = otpDigest(otp, mobileNumber);
  const matches = storedDigest && storedDigest.length === suppliedDigest.length && crypto.timingSafeEqual(
    Buffer.from(storedDigest),
    Buffer.from(suppliedDigest)
  );

  if (!matches) {
    await securityRepo.logSecurityEvent({
      userId: user._id,
      type: "MOBILE_OTP_VERIFICATION_FAILED",
      outcome: "FAILURE",
      ipAddress: context.ip
    });
    return buildResponse(401, "Invalid or expired OTP");
  }

  await redis.del(`mobile_otp:${user._id}`, attemptsKey, `mobile_otp_cooldown:${user._id}`);
  user.deviceToken = deviceToken;
  user.deviceType = deviceType;
  user.lastLogin = new Date();
  user.updatedAt = new Date();
  await user.save();

  await securityRepo.logSecurityEvent({
    userId: user._id,
    type: "MOBILE_OTP_VERIFIED",
    outcome: "SUCCESS",
    ipAddress: context.ip,
    metadata: { deviceType }
  });

  return buildResponse(200, "OTP verified successfully", {
    userResponse: await buildAppUserResponse(user)
  });
}

module.exports = { requestOtp, verifyOtp };
