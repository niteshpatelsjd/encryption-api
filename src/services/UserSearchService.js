const mongoose = require("mongoose");
const userSearchRepo = require("../repositories/UserSearchRepository");
const presenceService = require("../socket/PresenceService");
const s3Util = require("../utils/s3Util");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function decodeCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return mongoose.Types.ObjectId.isValid(cursor.id) ? { id: cursor.id } : null;
  } catch (_error) {
    return null;
  }
}

function encodeCursor(user) {
  return Buffer.from(JSON.stringify({ id: String(user._id) })).toString("base64url");
}

async function profileUrl(user) {
  if (!user.profileImageKey) return user.profileUrl || "";
  try {
    return await s3Util.getPreSignedUrl(user.profileImageKey) || "";
  } catch (error) {
    logger.warn("Unable to create user search profile URL", { userId: user._id, error: error.message });
    return "";
  }
}

async function search(authenticatedUserId, queryParams) {
  const query = typeof queryParams?.q === "string" ? queryParams.q.trim() : "";
  if (query.length < 2) return buildResponse(400, "Search query must contain at least 2 characters");
  if (query.length > 100) return buildResponse(400, "Search query is too long");

  let limit = Number.parseInt(queryParams?.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);
  const encodedCursor = typeof queryParams?.cursor === "string" && queryParams.cursor.trim()
    ? queryParams.cursor.trim()
    : null;
  const cursor = decodeCursor(encodedCursor);
  if (encodedCursor && !cursor) return buildResponse(400, "Invalid user search cursor");

  const records = await userSearchRepo.search({ authenticatedUserId, query, limit, cursor });
  const hasMore = records.length > limit;
  if (hasMore) records.pop();
  const content = await Promise.all(records.map(async user => {
    const [url, presence] = await Promise.all([
      profileUrl(user),
      presenceService.getPresence(String(user._id))
    ]);
    return {
      userId: user._id,
      name: user.name,
      profileUrl: url,
      online: presence.status === "ONLINE"
    };
  }));
  const last = records[records.length - 1];
  return buildResponse(200, "Users fetched successfully", {
    content,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    hasMore
  });
}

module.exports = { search, decodeCursor };
