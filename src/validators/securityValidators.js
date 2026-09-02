const mongoose = require("mongoose");

function requireFields(body, fields) {
  const missing = fields.filter(field => body?.[field] === undefined || body?.[field] === null || body?.[field] === "");
  return missing.length ? `Missing required fields: ${missing.join(", ")}` : null;
}

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function validatePrekeys(body, requireSigned = true) {
  const required = requireSigned ? ["deviceId", "signedPrekey", "signedPrekeySignature"] : ["deviceId"];
  const missing = requireFields(body, required);
  if (missing) return missing;
  if (requireSigned && (!Number.isInteger(body.signedPrekey?.keyId) || !body.signedPrekey?.publicKey)) return "signedPrekey requires an integer keyId and publicKey";
  const keys = body.preKeys ?? body.oneTimePrekeys;
  if (!requireSigned && keys === undefined) return "Missing required fields: preKeys";
  if (keys !== undefined && !Array.isArray(keys)) return "preKeys must be an array";
  if ((keys || []).some(key => !Number.isInteger(key.keyId) || !key.publicKey)) return "Each one-time prekey requires an integer keyId and publicKey";
  return null;
}

module.exports = { requireFields, validObjectId, validatePrekeys };
