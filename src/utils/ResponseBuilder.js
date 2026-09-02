// utils/responseBuilder.js
const { convertDateToString } = require("./DateUtil");
const Role = require("../models/Role");
const s3Util = require("./s3Util");

function buildRoleResponse(role) {
  if (!role) return null;

  return {
    id: role._id,
    roleName: role.roleName,
    roleDescription: role.roleDescription,
    roleModuleList: role.roleModuleList
      ? role.roleModuleList.map(rm => buildRoleModuleResponse(rm))
      : [],
    status: role.status,
    createdAt: convertDateToString(role.createdAt),
    updatedAt: convertDateToString(role.updatedAt),
  };
}

function buildRoleModuleResponse(roleModule) {
  if (!roleModule) return null;

  return {
    id: roleModule._id,
    roleId: roleModule.roleId,
    organizationId: roleModule.organizationId,
    moduleId: roleModule.moduleId?._id || roleModule.moduleId, // handle populated vs ObjectId
    moduleName: roleModule.moduleName,
    moduleCode: roleModule.moduleCode,
    parentModuleName: roleModule.parentModuleName,
    moduleAction: roleModule.moduleAction,
    addAction: roleModule.addAction,
    updateAction: roleModule.updateAction,
    deleteAction: roleModule.deleteAction,
    downloadAction: roleModule.downloadAction,
    viewAction: roleModule.viewAction,
    status: roleModule.status,
    createdAt: convertDateToString(roleModule.createdAt),
    updatedAt: convertDateToString(roleModule.updatedAt),
  };
}


function buildModuleResponse(module) {

  if (!module) return null;

  return {
    id: module._id,
    organizationId: module.organizationId,
    moduleName: module.moduleName,
    parentModuleName: module.parentModuleName,
    moduleCode: module.moduleCode,
    addAction: module.addAction,
    updateAction: module.updateAction,
    deleteAction: module.deleteAction,
    downloadAction: module.downloadAction,
    viewAction: module.viewAction,
    status: module.status,
    createdAt: convertDateToString(module.createdAt),
    updatedAt: convertDateToString(module.updatedAt),
  };
}

async function buildUserResponse(user) {

    if (!user) return null;

    let profileUrl = "";

    if (user.profileImageKey) {

        profileUrl = await s3Util.getPreSignedUrl(
            user.profileImageKey
        );

    }

    return {

        id: user._id,

        name: user.name || "",

        email: user.email || "",

        countryCode: user.countryCode || "",

        mobileNumber: user.mobileNumber || "",

        address: user.address || "",

        city: user.city || "",

        country: user.country || "",

        profileUrl,

        profileImageKey: user.profileImageKey || "",

        status: user.status,

        profileCompleted: user.profileCompleted || false,

        roleId: user.roleId?._id || user.roleId || "",

        deviceType: user.deviceType || null,

        lastLogin: user.lastLogin
            ? convertDateToString(user.lastLogin)
            : null,

        createdAt: convertDateToString(user.createdAt),

        updatedAt: convertDateToString(user.updatedAt)

    };

}


async function buildUserRoleResponse(user) {

    if (!user) return null;

    let role = null;
    // ==============================
    // Fetch Role
    // ==============================

    if (user.roleId) {

        // Reuse repository-populated Role data for list APIs. Fall back to a
        // query for profile/login flows that fetch an unpopulated AdminUser.
        role = user.roleId.roleName !== undefined
            ? user.roleId
            : await Role.findById(user.roleId)
                .populate("roleModuleList");

    }

    // ==============================
    // Generate Profile URL
    // ==============================

    let profileUrl = "";

    if (user.profileImageKey) {

        profileUrl = await s3Util.getPreSignedUrl(
            user.profileImageKey
        );

    }

    return {

        id: user._id,

        name: user.name || "",

        email: user.email || "",

        countryCode: user.countryCode || "",

        mobileNumber: user.mobileNumber || "",

        address: user.address || "",

        city: user.city || "",

        country: user.country || "",

        profileUrl,

        profileImageKey: user.profileImageKey || "",

        status: user.status,

        profileCompleted: user.profileCompleted || false,

        roleId: user.roleId?._id || user.roleId || null,

        deviceType: user.deviceType || null,

        lastLogin: user.lastLogin
            ? convertDateToString(user.lastLogin)
            : null,

        createdAt: convertDateToString(user.createdAt),

        updatedAt: convertDateToString(user.updatedAt),

        // Embedded Role
        roleResponse: role
            ? buildRoleResponse(role)
            : null

    };

}

function buildContentResponse(content) {
  if (!content) return null;

  return {
    id: content._id,
    type: content.type,
    lang: content.lang,
    content: content.content,
    createdAt: convertDateToString(content.createdAt),
    updatedAt: convertDateToString(content.updatedAt),
  };
}



async function buildAppUserResponse(user) {

    if (!user) {
        return null;
    }

    let profileUrl = "";

    // ======================================
    // Profile Image
    // ======================================

    if (user.profileImageKey) {

        profileUrl = await s3Util.getPreSignedUrl(
            user.profileImageKey
        );

    }

    return {

        id: user._id,

        name: user.name || "",

        occupation: user.occupation || "",

        email: user.email || "",

        gender: user.gender || "",

        countryCode: user.countryCode || "",

        mobileNumber: user.mobileNumber || "",

        profileUrl,

        profileImageKey:
            user.profileImageKey || "",

        organizationId:
            user.organizationId || null,

        isEmailVerified:
            user.isEmailVerified || false,

        profileCompleted:
            user.profileCompleted || false,

        joinOrganization:
            user.joinOrganization || false,

        status:
            user.status,

        deviceType:
            user.deviceType || null,

        lastLogin:
            user.lastLogin
                ? convertDateToString(user.lastLogin)
                : null,

        // ======================================
        // Notification Settings
        // ======================================

        notificationEnable:
            user.notificationEnable !== undefined
                ? user.notificationEnable
                : true,

        alertNotification:
            user.alertNotification !== undefined
                ? user.alertNotification
                : true,

        announcementNotification:
            user.announcementNotification !== undefined
                ? user.announcementNotification
                : true,

        eventNotification:
            user.eventNotification !== undefined
                ? user.eventNotification
                : true,

        disappearingMessagesEnabled:
            user.disappearingMessagesEnabled === true,

        // ======================================
        // Dates
        // ======================================

        createdAt:
            convertDateToString(
                user.createdAt
            ),

        updatedAt:
            convertDateToString(
                user.updatedAt
            )
    };
}


function buildNotificationResponse(notification) {
  if (!notification) return null;

  return {
    id: notification._id,
    userId: notification.userId,
    organizationId: notification.organizationId || null,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    data: notification.data || {},
    imageUrl: notification.imageUrl,
    isRead: notification.isRead,
    readAt: convertDateToString(notification.readAt),
    sentStatus: notification.sentStatus,
    firebaseMessageId: notification.firebaseMessageId,
    failureReason: notification.failureReason,
    status: notification.status,
    createdAt: convertDateToString(notification.createdAt),
    updatedAt: convertDateToString(notification.updatedAt),
  };
}



module.exports = {
  buildUserRoleResponse,
  buildUserResponse,
  buildRoleResponse,
  buildRoleModuleResponse,
  buildModuleResponse,
  buildContentResponse,
  buildAppUserResponse,
  buildNotificationResponse,
};
