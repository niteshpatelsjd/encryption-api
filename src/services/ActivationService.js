const jwt = require("jsonwebtoken");
const securityRepo = require("../repositories/SecurityRepository");
const buildResponse = require("../utils/response");
const { hash, hashActivationCode } = require("../utils/security");
const { ACTIVATION_TTL_MINUTES } = require("../constants/SecurityConstants");

function secret() {
  const value = process.env.ACTIVATION_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error("Activation token secret is not configured");
  return value;
}

async function activate(body, context = {}) {
  const serialId = body?.serialId?.trim().toUpperCase();
  if (!serialId) return buildResponse(400, "serialId is required");
  // SHA-256 fallback is migration-only for activation codes generated before
  // SHA-512 activation hashing was introduced.
  const record = await securityRepo.findActivation(hashActivationCode(serialId))
    || await securityRepo.findActivation(hash(serialId));
  if (!record) {
    await securityRepo.logSecurityEvent({ type: "ACTIVATION_FAILED", outcome: "FAILURE", ipAddress: context.ip });
    return buildResponse(400, "Invalid activation code");
  }
  if (record.expiresAt <= new Date()) {
    if (record.status !== "EXPIRED") { record.status = "EXPIRED"; await record.save(); }
    return buildResponse(410, "Activation code expired");
  }
  if (!["ACTIVE", "PENDING"].includes(record.status)) return buildResponse(409, `Activation code is ${record.status.toLowerCase()}`);
  if (!record.userId || record.userId.status !== 1) return buildResponse(403, "Assigned user is blocked or unavailable");
  const pending = await securityRepo.setActivationPending(record._id);
  if (!pending) return buildResponse(409, "Activation code is unavailable");
  const activationToken = jwt.sign({ purpose: "DEVICE_ACTIVATION", activationId: record._id.toString(), userId: record.userId._id.toString() }, secret(), { expiresIn: `${ACTIVATION_TTL_MINUTES}m`, issuer: "encryption-api" });
  await securityRepo.logSecurityEvent({ userId: record.userId._id, type: "ACTIVATION_VALIDATED", outcome: "SUCCESS", ipAddress: context.ip });
  return buildResponse(200, "Activation code validated", { userId: record.userId._id, activationToken, expiresInSeconds: ACTIVATION_TTL_MINUTES * 60 });
}

function verifyActivationToken(token) {
  const payload = jwt.verify(token, secret(), { issuer: "encryption-api" });
  if (payload.purpose !== "DEVICE_ACTIVATION") throw new Error("Invalid activation token purpose");
  return payload;
}

module.exports = { activate, verifyActivationToken };
