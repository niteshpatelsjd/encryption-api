const crypto = require("crypto");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const hashActivationCode = value => crypto.createHash("sha512").update(value).digest("hex");
const randomToken = bytes => crypto.randomBytes(bytes).toString("base64url");

function assertPublicMaterialOnly(value, path = "request") {
  if (typeof value === "string" && /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i.test(value)) {
    const error = new Error(`Private key material is forbidden at ${path}`);
    error.statusCode = 400;
    throw error;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/private|plaintext|messagekey|callkey|decrypted/i.test(key)) {
      const error = new Error(`Forbidden sensitive field: ${path}.${key}`);
      error.statusCode = 400;
      throw error;
    }
    assertPublicMaterialOnly(child, `${path}.${key}`);
  }
}

module.exports = { hash, hashActivationCode, randomToken, assertPublicMaterialOnly };
