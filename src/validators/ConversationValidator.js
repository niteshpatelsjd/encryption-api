const mongoose = require("mongoose");
const { DEFAULT_LIMIT, MAX_LIMIT } = require("../constants/ConversationConstants");

function validateCreateConversation(body, authenticatedUserId) {
  const participantUserId = typeof body?.participantUserId === "string"
    ? body.participantUserId.trim()
    : "";

  if (!mongoose.Types.ObjectId.isValid(participantUserId)) {
    return { error: "A valid participantUserId is required" };
  }
  if (String(participantUserId) === String(authenticatedUserId)) {
    return { error: "A direct conversation cannot be created with yourself" };
  }
  return { participantUserId };
}

function parseConversationListQuery(query) {
  let limit = Number.parseInt(query?.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const cursor = typeof query?.cursor === "string" && query.cursor.trim()
    ? query.cursor.trim()
    : null;

  return { limit, cursor };
}

module.exports = { validateCreateConversation, parseConversationListQuery };
