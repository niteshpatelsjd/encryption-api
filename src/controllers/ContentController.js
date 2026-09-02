const contentService = require("../services/ContentService");
const  buildResponse  = require("../utils/response");
const logger = require("../utils/logger");

/**
 * ✅ Get Content by Type
 */
exports.getContent = async (req, res) => {
  try {
    const { type, lang } = req.query;

    if (!type) {
      logger.warn("⚠️ Missing query parameter 'type'");
      return res
        .status(200)
        .json(buildResponse(400, "Query parameter 'type' is required", null));
    }

    logger.info(`📄 Fetching content for type=${type}`);
    const result = await contentService.getContentByType(type, lang);

    res
      .status(200)
      .json(buildResponse(result.responseCode, result.message, result.responseBody));
  } catch (error) {
    logger.error("❌ getContent controller error", { error });
    res.status(500).json(buildResponse(500, "Internal server error", null));
  }
};

/**
 * ✅ Update or Create Content by Type
 */
exports.updateContent = async (req, res) => {
  try {
    const { type, lang, content } = req.body;

    if (!type) {
      logger.warn("⚠️ Missing required field 'type'");
      return res
        .status(200)
        .json(buildResponse(400, "Field 'type' is required", null));
    }

    logger.info(`📝 Updating content for type=${type}`);
    const result = await contentService.updateContent(type, lang, content);

    res
      .status(200)
      .json(buildResponse(result.responseCode, result.message, result.responseBody));
  } catch (error) {
    logger.error("❌ updateContent controller error", { error });
    res.status(500).json(buildResponse(500, "Internal server error", null));
  }
};
