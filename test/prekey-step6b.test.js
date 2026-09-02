const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const OneTimePrekey = require("../src/models/OneTimePrekey");
const prekeyRepository = require("../src/repositories/PrekeyRepository");
const { validatePrekeys } = require("../src/validators/securityValidators");

test("one-time prekeys have unique device/key identity and claim indexes", () => {
  const indexes = OneTimePrekey.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.deviceId === 1 && fields.keyId === 1 && options.unique));
  assert.ok(indexes.some(([fields]) => fields.status === 1 && fields.userId === 1));
});

test("replenishment accepts preKeys and legacy oneTimePrekeys", () => {
  const key = { keyId: 1, publicKey: "PUBLIC_KEY" };
  assert.equal(validatePrekeys({ deviceId: "device-a", preKeys: [key] }, false), null);
  assert.equal(validatePrekeys({ deviceId: "device-a", oneTimePrekeys: [key] }, false), null);
  assert.equal(validatePrekeys({ deviceId: "device-a" }, false), "Missing required fields: preKeys");
});

test("claim uses one atomic AVAILABLE to CLAIMED update with claimant metadata", async () => {
  const original = OneTimePrekey.findOneAndUpdate;
  let captured;
  OneTimePrekey.findOneAndUpdate = (filter, update, options) => {
    captured = { filter, update, options };
    return { lean: async () => ({ keyId: 9, publicKey: "PUBLIC_KEY", status: "CLAIMED" }) };
  };
  try {
    const userId = new mongoose.Types.ObjectId();
    const claimantUserId = new mongoose.Types.ObjectId();
    const result = await prekeyRepository.claimOneTimePrekey(userId, "target-device", {
      userId: claimantUserId,
      deviceId: "claimant-device"
    });
    assert.equal(captured.filter.status, "AVAILABLE");
    assert.equal(captured.update.$set.status, "CLAIMED");
    assert.equal(captured.update.$set.claimedByDeviceId, "claimant-device");
    assert.equal(String(captured.update.$set.claimedByUserId), String(claimantUserId));
    assert.deepEqual(captured.options.sort, { keyId: 1 });
    assert.equal(captured.options.new, true);
    assert.equal(result.keyId, 9);
  } finally {
    OneTimePrekey.findOneAndUpdate = original;
  }
});

test("duplicate device/key uploads use insert-only upserts", async () => {
  const original = OneTimePrekey.bulkWrite;
  let operations;
  OneTimePrekey.bulkWrite = async value => { operations = value; };
  try {
    await prekeyRepository.insertOneTimePrekeys(new mongoose.Types.ObjectId(), "device-a", [
      { keyId: 12, publicKey: "PUBLIC_KEY" }
    ]);
    assert.equal(operations[0].updateOne.filter.deviceId, "device-a");
    assert.equal(operations[0].updateOne.filter.keyId, 12);
    assert.equal(operations[0].updateOne.upsert, true);
    assert.ok(operations[0].updateOne.update.$setOnInsert);
    assert.equal(operations[0].updateOne.update.$set, undefined);
  } finally {
    OneTimePrekey.bulkWrite = original;
  }
});
