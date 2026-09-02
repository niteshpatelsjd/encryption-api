const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { hash, hashActivationCode } = require("../src/utils/security");

test("activation codes use SHA-512 while generic token hashes remain SHA-256", () => {
  const serialId = "ENC-EXAMPLE-SERIAL";
  const activationDigest = hashActivationCode(serialId);
  assert.equal(activationDigest, crypto.createHash("sha512").update(serialId).digest("hex"));
  assert.equal(activationDigest.length, 128);
  assert.equal(hash(serialId).length, 64);
  assert.notEqual(activationDigest, hash(serialId));
});
