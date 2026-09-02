const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");
const notificationRepo = require("../repositories/NotificationRepository");
const fcmService = require("./FcmService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");
const {
  buildNotificationResponse,
} = require("../utils/ResponseBuilder");
const s3Util = require("../utils/s3Util");
const DataConstant = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,

  NOTIFICATION_CREATED: "Notification created successfully",
  NOTIFICATION_READ: "Notification marked as read successfully",
  NOTIFICATIONS_READ: "All notifications marked as read successfully",
  NOTIFICATION_NOT_FOUND: "Notification not found",
  USER_NOT_FOUND: "User not found",
  RECORD_FOUND: "Record found",
  RECORDS_FETCHED: "Records fetched successfully",
  RECORDS_NOT_FOUND: "Records not found",
  INVALID_REQUEST: "Invalid request",
  SERVER_MESSAGE: "Internal Server Error",
};




async function canSendNotification(user, notificationType) {

  // ======================================
  // Master Notification Switch
  // ======================================

  if (!user.notificationEnable) {
    return false;
  }

  // ======================================
  // Notification Type
  // ======================================

  switch ((notificationType || "GENERAL").toUpperCase()) {

    case "ALERT":

      return user.alertNotification !== false;

    case "ANNOUNCEMENT":

      return user.announcementNotification !== false;

    case "EVENT":

      return user.eventNotification !== false;

    case "GENERAL":

      return true;

    default:

      // For any new notification type,
      // master notification setting is enough.
      return true;
  }
}


async function createNotification(notificationRequest) {

  logger.info("createNotification service called", {
    userId: notificationRequest?.userId,
    title: notificationRequest?.title,
    type: notificationRequest?.type,
    organizationId: notificationRequest?.organizationId,
    hasImageFile: !!notificationRequest?.imageFile
  });

  try {

    // ======================================
    // Request Data
    // ======================================

    const {
      userId,
      title,
      message
    } = notificationRequest;

    const notificationType =
      (
        notificationRequest.type ||
        "GENERAL"
      ).toUpperCase();

    // A notification addressed to an organization is broadcast to its approved
    // members. userId is only required for an individual notification.
    if (!userId && notificationRequest?.organizationId) {
      return createOrganizationNotification(notificationRequest);
    }


    // ======================================
    // Optional Organization ID
    // ======================================

    let organizationId = null;

    if (
      notificationRequest?.organizationId &&
      mongoose.Types.ObjectId.isValid(
        notificationRequest.organizationId
      )
    ) {

      organizationId =
        notificationRequest.organizationId;

    }


    // ======================================
    // Validation
    // ======================================

    if (!userId || !title || !message) {

      logger.warn(
        "createNotification validation failed",
        {
          userId,
          title,
          message
        }
      );

      return buildResponse(
        DataConstant.BAD_REQUEST,
        DataConstant.INVALID_REQUEST
      );
    }


    // ======================================
    // Find User
    // ======================================

    const user =
      await User.findById(userId);

    if (!user) {

      logger.warn(
        "createNotification failed: user not found",
        {
          userId
        }
      );

      return buildResponse(
        DataConstant.NOT_FOUND,
        DataConstant.USER_NOT_FOUND
      );
    }


    // ======================================
    // Upload Notification Image
    // ======================================
    //
    // imageFile is OPTIONAL.
    //
    // If imageFile exists:
    //      Upload to S3
    //
    // If imageFile does not exist:
    //      imageUrlKey remains null
    //
    // ======================================

    let imageUrlKey = null;

    if (notificationRequest.imageFile) {

      try {

        const uploadResult =
          await s3Util.uploadFile(
            notificationRequest.imageFile,
            "notification/image"
          );

        imageUrlKey =
          uploadResult.key;

        logger.info(
          "Notification image uploaded successfully",
          {
            userId,
            imageUrlKey
          }
        );

      } catch (error) {

        logger.error(
          "Notification image upload failed",
          {
            userId,
            error: error.message,
            stack: error.stack
          }
        );

        return buildResponse(
          DataConstant.SERVER_ERROR,
          "Failed to upload notification image.",
          null
        );
      }
    }


    // ======================================
    // Check Notification Preference
    // ======================================

    const allowed =
      await canSendNotification(
        user,
        notificationType
      );


    // ======================================
    // Notification Disabled
    // ======================================

    if (!allowed) {

      logger.info(
        "Notification skipped due to user notification settings",
        {
          userId,
          type: notificationType,
          organizationId
        }
      );


      const notification =
        new Notification({

          userId,

          organizationId,

          title:
            title.trim(),

          message:
            message.trim(),

          type:
            notificationType,

          data:
            notificationRequest.data || {},

          imageUrlKey,

          sentStatus:
            "SKIPPED",

          status:
            1,

          failureReason:
            "Notification disabled by user preference"

        });


      const saved =
        await notificationRepo.save(
          notification
        );


      logger.info(
        "Notification saved as SKIPPED",
        {
          id: saved._id,
          userId,
          organizationId,
          type: notificationType
        }
      );


      return buildResponse(
        DataConstant.CREATED,
        DataConstant.NOTIFICATION_CREATED,
        buildNotificationResponse(saved)
      );
    }


    // ======================================
    // Check FCM Token
    // ======================================

    if (!user.deviceToken) {

      logger.warn(
        "User does not have FCM device token",
        {
          userId,
          organizationId
        }
      );


      const notification =
        new Notification({

          userId,

          organizationId,

          title:
            title.trim(),

          message:
            message.trim(),

          type:
            notificationType,

          data:
            notificationRequest.data || {},

          imageUrlKey,

          sentStatus:
            "FAILED",

          status:
            1,

          failureReason:
            "FCM device token not available"

        });


      const saved =
        await notificationRepo.save(
          notification
        );


      return buildResponse(
        DataConstant.CREATED,
        DataConstant.NOTIFICATION_CREATED,
        buildNotificationResponse(saved)
      );
    }


    // ======================================
    // Build Image URL
    // ======================================
    //
    // IMPORTANT:
    // If FCM requires a public URL, you need
    // to generate/use the S3 URL here.
    //
    // If your s3Util has getFileUrl(), use it.
    //
    // ======================================

    let imageUrl = null;

    if (imageUrlKey) {

      imageUrl =
        await s3Util.getPreSignedUrl(
          imageUrlKey
        );
    }


    // ======================================
    // Create Notification
    // ======================================

    const notification =
      new Notification({

        userId,

        organizationId,

        title:
          title.trim(),

        message:
          message.trim(),

        type:
          notificationType,

        data:
          notificationRequest.data || {},

        imageUrlKey,

        sentStatus:
          "PENDING",

        status:
          1

      });


    // ======================================
    // Send FCM
    // ======================================

    const sentResult =
      await fcmService.sendNotification({

        token:
          user.deviceToken,

        title:
          notification.title,

        message:
          notification.message,

        data:
          notification.data,

        imageUrl

      });


    // ======================================
    // Update FCM Result
    // ======================================

    notification.sentStatus =
      sentResult.sentStatus;

    notification.firebaseMessageId =
      sentResult.firebaseMessageId;

    notification.failureReason =
      sentResult.failureReason;


    // ======================================
    // Save Notification
    // ======================================

    const saved =
      await notificationRepo.save(
        notification
      );


    logger.info(
      "createNotification completed",
      {
        id: saved._id,
        userId,
        organizationId,
        type: notificationType,
        imageUrlKey,
        sentStatus:
          saved.sentStatus
      }
    );


    // ======================================
    // Response
    // ======================================

    return buildResponse(
      DataConstant.CREATED,
      DataConstant.NOTIFICATION_CREATED,
      buildNotificationResponse(saved)
    );


  } catch (error) {

    logger.error(
      "createNotification service error",
      {
        userId:
          notificationRequest?.userId,

        organizationId:
          notificationRequest?.organizationId,

        type:
          notificationRequest?.type,

        error:
          error.message,

        stack:
          error.stack
      }
    );


    return buildResponse(
      DataConstant.SERVER_ERROR,
      DataConstant.SERVER_MESSAGE
    );
  }
}


async function markRead({ id, userId }) {
  logger.info("markRead service called", { id, userId });

  try {
    if (!id) {
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const notification = await notificationRepo.findById(id);
    if (!notification || notification.status === 0) {
      logger.warn("markRead failed: notification not found", { id });
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.NOTIFICATION_NOT_FOUND);
    }

    if (userId && notification.userId.toString() !== userId) {
      logger.warn("markRead failed: notification does not belong to user", { id, userId });
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.NOTIFICATION_NOT_FOUND);
    }

    notification.isRead = true;
    notification.readAt = notification.readAt || new Date();
    const updated = await notificationRepo.save(notification);

    return buildResponse(
      DataConstant.OK,
      DataConstant.NOTIFICATION_READ,
      buildNotificationResponse(updated)
    );
  } catch (error) {
    logger.error("markRead service error", { error: error.message, stack: error.stack });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function markAllRead({ userId }) {
  logger.info("markAllRead service called", { userId });

  try {
    if (!userId) {
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const result = await notificationRepo.updateMany(
      { userId, status: { $ne: 0 }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return buildResponse(DataConstant.OK, DataConstant.NOTIFICATIONS_READ, {
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    logger.error("markAllRead service error", { error: error.message, stack: error.stack });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function getById({ id }) {
  logger.info("getNotificationById service called", { id });

  try {
    if (!id) {
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const notification = await notificationRepo.findById(id);
    if (!notification || notification.status === 0) {
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.NOTIFICATION_NOT_FOUND);
    }

    return buildResponse(
      DataConstant.OK,
      DataConstant.RECORD_FOUND,
      buildNotificationResponse(notification)
    );
  } catch (error) {
    logger.error("getNotificationById service error", {
      error: error.message,
      stack: error.stack,
    });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function getAll({
  pageIndex,
  pageSize,
  searchText,
  type,
  userId,
  organizationId,
}) {
  logger.info("getAllNotifications service called", {
    pageIndex,
    pageSize,
    searchText,
    type,
    userId,
    organizationId,
  });

  try {
    // ======================================
    // Pagination
    // ======================================

    pageIndex = parseInt(pageIndex || 0, 10);
    pageSize = parseInt(pageSize || 10, 10);

    // ======================================
    // Base Query
    // ======================================

    const query = {
      status: { $ne: 0 },
    };

    // ======================================
    // User Filter
    // ======================================

    if (userId) {
      query.userId = userId;
    }

    // ======================================
    // Organization Filter
    // ======================================

    if (organizationId) {
      query.organizationId = organizationId;
    }

    // ======================================
    // Type Filter
    // ======================================

    if (type) {
      query.type = type;
    }

    // ======================================
    // Today's Announcement
    // ======================================
    //
    // When:
    // type = ANNOUNCEMENT
    //
    // only today's announcements will be returned.
    //
    // createdAt is assumed to be the notification
    // creation date.
    //
    // ======================================

    if (
      type &&
      type.toUpperCase() === "ANNOUNCEMENT"
    ) {
      const startOfToday = new Date();

      startOfToday.setHours(
        0,
        0,
        0,
        0
      );

      const endOfToday = new Date();

      endOfToday.setHours(
        23,
        59,
        59,
        999
      );

      query.createdAt = {
        $gte: startOfToday,
        $lte: endOfToday,
      };
    }

    // ======================================
    // Search
    // ======================================

    if (searchText?.trim()) {
      const search = searchText.trim();

      query.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          message: {
            $regex: search,
            $options: "i",
          },
        },
        {
          type: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // ======================================
    // Pagination
    // ======================================

    const skip =
      pageIndex * pageSize;


    // ======================================
    // Unread Count Base Query
    // ======================================
    //
    // IMPORTANT:
    // This query intentionally does NOT contain
    // the requested "type" filter.
    //
    // So even if:
    //
    // type = ANNOUNCEMENT
    //
    // we can still calculate:
    //
    // EVENT unread count
    // ALERT unread count
    // ANNOUNCEMENT unread count
    //
    // for the user.
    //
    // ======================================

    const unreadBaseQuery = {
      status: { $ne: 0 },
      isRead: false,
    };

    if (userId) {
      unreadBaseQuery.userId = userId;
    }

    if (organizationId) {
      unreadBaseQuery.organizationId =
        organizationId;
    }


    // ======================================
    // Execute Queries
    // ======================================

    const [
      notifications,
      totalRecords,
      totalUnread,

      eventCount,
      alertCount,
      announcementCount,

      unreadCount,
    ] = await Promise.all([

      // ====================================
      // Notifications
      // ====================================

      notificationRepo.findAll(
        query,
        skip,
        pageSize
      ),

      // ====================================
      // Total Records
      // ====================================

      notificationRepo.countDocuments(
        query
      ),

      // ====================================
      // Total Unread
      // ====================================
      //
      // This follows the requested query
      // including type/date filters.
      //
      // ====================================

      notificationRepo.countDocuments({
        ...query,
        isRead: false,
      }),

      // ====================================
      // Unread Events
      // ====================================

      notificationRepo.countDocuments({
        ...unreadBaseQuery,
        type: "EVENT",
      }),

      // ====================================
      // Unread Alerts
      // ====================================

      notificationRepo.countDocuments({
        ...unreadBaseQuery,
        type: "ALERT",
      }),

      // ====================================
      // Unread Announcements
      // ====================================

      notificationRepo.countDocuments({
        ...unreadBaseQuery,
        type: "ANNOUNCEMENT",
      }),

      // ====================================
      // Total Unread Notifications
      // ====================================

      notificationRepo.countDocuments(
        unreadBaseQuery
      ),
    ]);


    // ======================================
    // No Records
    // ======================================

    if (
      !notifications ||
      notifications.length === 0
    ) {
      return buildResponse(
        DataConstant.NOT_FOUND,
        DataConstant.RECORDS_NOT_FOUND,
        null
      );
    }


    // ======================================
    // Pagination
    // ======================================

    const totalPages =
      Math.ceil(
        totalRecords / pageSize
      );


    // ======================================
    // Response
    // ======================================

    return buildResponse(
      DataConstant.OK,
      DataConstant.RECORDS_FETCHED,
      {
        content:
          notifications.map(
            buildNotificationResponse
          ),

        pageIndex,

        pageSize,

        totalRecords,

        // Unread count according to current
        // query/type
        totalUnread,

        // ==================================
        // Unread Type Counts
        // ==================================

        eventCount,

        alertCount,

        announcementCount,

        unreadCount,

        // ==================================
        // Pagination
        // ==================================

        totalPages,

        isLast:
          pageIndex + 1 >=
          totalPages,

        hasNext:
          pageIndex + 1 <
          totalPages,

        hasPrevious:
          pageIndex > 0,
      }
    );

  } catch (error) {

    logger.error(
      "getAllNotifications service error",
      {
        error: error.message,
        stack: error.stack,
      }
    );

    return buildResponse(
      DataConstant.SERVER_ERROR,
      DataConstant.SERVER_MESSAGE
    );
  }
}
async function getAllNotification(notificationRequest) {
  const result = await getAll(notificationRequest);

  if (
    result.responseCode !== DataConstant.OK ||
    !result.responseBody?.content?.length
  ) {
    return result;
  }

  try {
    const organizationIds = [
      ...new Set(
        result.responseBody.content
          .map(notification => notification.organizationId?.toString())
          .filter(Boolean)
      )
    ];

    if (!organizationIds.length) {
      result.responseBody.content = result.responseBody.content.map(notification => ({
        ...notification,
        organization: null
      }));
      return result;
    }

    const organizations = await Organization.find({
      _id: { $in: organizationIds }
    }).lean();

    const organizationResponses = await Promise.all(
      organizations.map(async organization => {
        try {
          const response = await buildOrganizationResponse(organization);
          // QR image data is intentionally excluded from notification lists.
          if (response) delete response.qrCode;
          return [organization._id.toString(), response];
        } catch (error) {
          logger.warn("Unable to build notification organization response", {
            organizationId: organization._id,
            error: error.message
          });
          return [organization._id.toString(), null];
        }
      })
    );

    const organizationById = new Map(organizationResponses);
    result.responseBody.content = result.responseBody.content.map(notification => ({
      ...notification,
      organization: notification.organizationId
        ? organizationById.get(notification.organizationId.toString()) || null
        : null
    }));

    return result;
  } catch (error) {
    logger.error("getAllNotification organization enrichment error", {
      error: error.message,
      stack: error.stack
    });
    return result;
  }
}

async function getAllEvents() {
  logger.info("getAllEvents service called");

  try {
    const events = await notificationRepo.distinctTypes();
    return buildResponse(DataConstant.OK, DataConstant.RECORDS_FETCHED, events);
  } catch (error) {
    logger.error("getAllEvents service error", {
      error: error.message,
      stack: error.stack,
    });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function getUpcomingEvents({ organizationId }) {
  logger.info("getUpcomingEvents service called", { organizationId });

  try {
    if (!organizationId) {
      logger.warn("getUpcomingEvents validation failed: organizationId is required");
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const events = await notificationRepo.findUpcomingEventsByOrganizationId(
      organizationId,
      new Date()
    );

    if (!events || events.length === 0) {
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.RECORDS_NOT_FOUND, null);
    }

    return buildResponse(
      DataConstant.OK,
      DataConstant.RECORDS_FETCHED,
      events.map(buildNotificationResponse)
    );
  } catch (error) {
    logger.error("getUpcomingEvents service error", {
      error: error.message,
      stack: error.stack,
    });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

module.exports = {
  createNotification,
  markRead,
  markAllRead,
  getById,
  getAll,
  getAllNotification,
  getAllEvents,
  getUpcomingEvents,
};
