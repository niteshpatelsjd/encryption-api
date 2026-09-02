const mongoose = require("mongoose");
const {
  DEFAULT_SYNC_LIMIT,
  MAX_SYNC_LIMIT,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT
} = require("../constants/MessageConstants");

function decodeCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(cursor.createdAt);
    if (!mongoose.Types.ObjectId.isValid(cursor.id) || Number.isNaN(createdAt.getTime())) return null;
    return { id: cursor.id, createdAt: createdAt.toISOString() };
  } catch (_error) {
    return null;
  }
}

function parseQuery(query, type) {
  const isSync = type === "sync";
  const defaultLimit = isSync ? DEFAULT_SYNC_LIMIT : DEFAULT_HISTORY_LIMIT;
  const maxLimit = isSync ? MAX_SYNC_LIMIT : MAX_HISTORY_LIMIT;
  let limit = Number.parseInt(query?.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);
  const encodedCursor = isSync ? query?.cursor : (query?.before ?? query?.cursor);
  const cursorValue = typeof encodedCursor === "string" && encodedCursor.trim() ? encodedCursor.trim() : null;
  const cursor = decodeCursor(cursorValue);
  return { limit, cursor, invalidCursor: Boolean(cursorValue && !cursor) };
}

module.exports = { parseQuery, decodeCursor };
