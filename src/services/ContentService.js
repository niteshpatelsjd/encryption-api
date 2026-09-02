// services/ContentService.js
const Content = require("../models/Content");
const logger = require("../utils/logger");
const  { buildResponse } = require("../utils/response"); // Optional if you use common response builder
const  { buildContentResponse } = require("../utils/ResponseBuilder");
/**
 * ✅ Get content by type
 */
async function getContentByType(type, lang) {
  logger.info("getContentByType called", { type, lang });

  try {
    if (!type) {
      logger.warn("⚠️ Missing required field 'type'");
      return { responseCode: 400, message: "Field 'type' is required", responseBody: null };
    }

    const content = await Content.findOne({ type, lang });
    if (!content) {
      logger.warn(`⚠️ No content found for type=${type} with lang = ${lang}`);
      return { responseCode: 404, message: "Content not found", responseBody: null };
    }

    logger.info(`✅ Content fetched successfully for type=${type} with lang = ${lang}`);
    return {
      responseCode: 200,
      message: "Content fetched successfully",
      responseBody: buildContentResponse(content)
    };
  } catch (error) {
    logger.error("❌ Error in getContentByType", { error });
    return { responseCode: 500, message: "Server error", responseBody: null };
  }
}

/**
 * ✅ Add / Update content by type
 */
async function updateContent(type, lang, content) {
  logger.info("updateContent called", { type, lang });

  try {
    if (!type) {
      logger.warn("⚠️ Missing required field 'type'");
      return { responseCode: 400, message: "Field 'type' is required", responseBody: null };
    }

    const updatePayload = {
      type,
      lang,
      content: content || "",
      updatedAt: new Date()
    };

    const updated = await Content.findOneAndUpdate(
      { type, lang },
      { $set: updatePayload },
      { new: true, upsert: true }
    );

    logger.info(`✅ Content updated successfully for type=${type}`);
    return {
      responseCode: 200,
      message: "Content updated successfully",
      responseBody: buildContentResponse(updated)
    };
  } catch (error) {
    logger.error("❌ Error in updateContent", { error });
    return { responseCode: 500, message: "Server error", responseBody: null };
  }
}

module.exports = {
  getContentByType,
  updateContent
};
