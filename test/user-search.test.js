const test = require("node:test");
const assert = require("node:assert/strict");
const { after } = require("node:test");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const userSearchRepo = require("../src/repositories/UserSearchRepository");
const userSearchService = require("../src/services/UserSearchService");
const presenceService = require("../src/socket/PresenceService");
const s3Util = require("../src/utils/s3Util");
const redis = require("../src/config/RedisConfig");

after(() => redis.disconnect());

test("repository filters active users, excludes self, and uses a safe projection", async () => {
  const original = User.aggregate;
  let pipeline;
  User.aggregate = async value => { pipeline = value; return []; };
  const authenticatedUserId = new mongoose.Types.ObjectId();
  try {
    await userSearchRepo.search({ authenticatedUserId, query: "rahul", limit: 20, cursor: null });
    assert.equal(pipeline[0].$match.status, 1);
    assert.equal(String(pipeline[0].$match._id.$ne), String(authenticatedUserId));
    assert.equal(pipeline[4].$limit, 21);
    assert.deepEqual(pipeline[5].$project, { _id: 1, name: 1, profileImageKey: 1, profileUrl: 1 });
    assert.equal(pipeline[5].$project.email, undefined);
    assert.equal(pipeline[5].$project.mobileNumber, undefined);
  } finally {
    User.aggregate = original;
  }
});

test("search response exposes only the approved mobile fields", async () => {
  const originals = {
    search: userSearchRepo.search,
    presence: presenceService.getPresence,
    signedUrl: s3Util.getPreSignedUrl
  };
  const userId = new mongoose.Types.ObjectId();
  userSearchRepo.search = async () => [{
    _id: userId,
    name: "Rahul Sharma",
    profileImageKey: "profiles/public-image.jpg",
    email: "must-not-leak@example.com",
    mobileNumber: "9999999999",
    deviceToken: "must-not-leak"
  }];
  presenceService.getPresence = async () => ({ status: "ONLINE" });
  s3Util.getPreSignedUrl = async () => "https://signed.example/profile";
  try {
    const result = await userSearchService.search(new mongoose.Types.ObjectId(), { q: "rah", limit: "20" });
    assert.equal(result.responseCode, 200);
    assert.deepEqual(Object.keys(result.responseBody.content[0]).sort(), ["name", "online", "profileUrl", "userId"]);
    assert.equal(result.responseBody.content[0].online, true);
    assert.equal(result.responseBody.content[0].profileUrl, "https://signed.example/profile");
  } finally {
    userSearchRepo.search = originals.search;
    presenceService.getPresence = originals.presence;
    s3Util.getPreSignedUrl = originals.signedUrl;
  }
});

test("search requires two characters and rejects malformed cursors", async () => {
  const tooShort = await userSearchService.search(new mongoose.Types.ObjectId(), { q: "r" });
  const badCursor = await userSearchService.search(new mongoose.Types.ObjectId(), { q: "rah", cursor: "not-a-cursor" });
  assert.equal(tooShort.responseCode, 400);
  assert.equal(badCursor.responseCode, 400);
});

test("exact mobile search is supported without selecting the mobile number", async () => {
  const original = User.aggregate;
  let capturedFilter;
  User.aggregate = async pipeline => { capturedFilter = pipeline[0].$match; return []; };
  try {
    await userSearchRepo.search({
      authenticatedUserId: new mongoose.Types.ObjectId(),
      query: "9876543210",
      limit: 20,
      cursor: null
    });
    assert.ok(capturedFilter.$or.some(condition => condition.mobileNumber === "9876543210"));
  } finally {
    User.aggregate = original;
  }
});
