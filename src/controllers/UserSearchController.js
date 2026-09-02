const userSearchService = require("../services/UserSearchService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

async function search(req, res) {
  try {
    const result = await userSearchService.search(req.user.userId, req.query);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Mobile user search error", { userId: req.user?.userId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

module.exports = { search };
