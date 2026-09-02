const notificationService = require("../services/NotificationService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

exports.createNotification = async (req, res) => {
  try {

    logger.info(
      "createNotification request received",
      {
        userId: req.body?.userId,
        organizationId: req.body?.organizationId,
        title: req.body?.title,
        type: req.body?.type,
        hasImageFile:
          !!req.files?.imageFile?.[0]
      }
    );

    // ======================================
    // Build Notification Request
    // ======================================

    const notificationRequest = {
      ...req.body,

      // Uploaded image file
      imageFile:
        req.files?.imageFile?.[0] || null
    };


    // ======================================
    // Create Notification
    // ======================================

    const result =
      await notificationService.createNotification(
        notificationRequest
      );


    // ======================================
    // Response
    // ======================================

    return res
      .status(result.responseCode)
      .json(result);

  } catch (error) {

    logger.error(
      "createNotification controller error",
      {
        userId:
          req.body?.userId,

        organizationId:
          req.body?.organizationId,

        error:
          error.message,

        stack:
          error.stack
      }
    );

    return res
      .status(500)
      .json(
        buildResponse(
          500,
          "Internal Server Error",
          null
        )
      );
  }
};

exports.markRead = async (req, res) => {
  try {
    const result = await notificationService.markRead(req.body);
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("markRead controller error", { error: error.message, stack: error.stack });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const result = await notificationService.markAllRead(req.body);
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("markAllRead controller error", { error: error.message, stack: error.stack });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await notificationService.getById({ id: req.query.id });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("getNotificationById controller error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.getAll = async (req, res) => {
  try {

    let {
      pageIndex = 0,
      pageSize = 10,
      searchText,
      type,
      userId,
      organizationId
    } = req.query;

    pageIndex = parseInt(pageIndex, 10);
    pageSize = parseInt(pageSize, 10);

    searchText =
      typeof searchText === "string"
        ? searchText.trim()
        : "";

    // ======================================
    // Normalize organizationId
    // ======================================

    if (
      organizationId === undefined ||
      organizationId === null ||
      organizationId === "" ||
      organizationId === "null" ||
      organizationId === "undefined"
    ) {
      organizationId = null;
    }

    // ======================================
    // Normalize userId
    // ======================================

    if (
      userId === undefined ||
      userId === null ||
      userId === "" ||
      userId === "null" ||
      userId === "undefined"
    ) {
      userId = null;
    }

    // ======================================
    // Normalize type
    // ======================================

    if (
      type === undefined ||
      type === null ||
      type === "" ||
      type === "null" ||
      type === "undefined"
    ) {
      type = null;
    }

    const result =
      await notificationService.getAll({
        pageIndex,
        pageSize,
        searchText,
        type,
        userId,
        organizationId
      });

    return res
      .status(200)
      .json(result);

  } catch (error) {

    logger.error(
      "getAllNotifications controller error",
      {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    );

    return res
      .status(500)
      .json(
        buildResponse(
          500,
          "Internal Server Error",
          null
        )
      );
  }
};

exports.getAllNotification = async (req, res) => {
  try {
    const normalizeOptional = value => {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "null" ||
        value === "undefined"
      ) {
        return null;
      }

      return typeof value === "string" ? value.trim() : value;
    };

    const result = await notificationService.getAllNotification({
      pageIndex: parseInt(req.query.pageIndex || 0, 10),
      pageSize: parseInt(req.query.pageSize || 10, 10),
      searchText: normalizeOptional(req.query.searchText) || "",
      type: normalizeOptional(req.query.type),
      userId: normalizeOptional(req.query.userId),
      organizationId: normalizeOptional(req.query.organizationId)
    });

    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("getAllNotification controller error", {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json(
      buildResponse(500, "Internal Server Error", null)
    );
  }
};

exports.getAllEvents = async (req, res) => {
  try {
    const result = await notificationService.getAllEvents();
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("getAllEvents controller error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.getUpcomingEvents = async (req, res) => {
  try {
    const { organizationId } = req.query;
    const result = await notificationService.getUpcomingEvents({ organizationId });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("getUpcomingEvents controller error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};
