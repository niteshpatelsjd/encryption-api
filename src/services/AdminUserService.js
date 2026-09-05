const adminUserRepo = require("../repositories/AdminUserRepository");
const redis = require("../config/RedisConfig");
const jwtUtil = require("../utils/JwtUtil");
const logger = require("../utils/logger");
const s3Util = require("../utils/s3Util");
const buildResponse = require("../utils/response");
const { buildUserResponse, buildUserRoleResponse } = require("../utils/ResponseBuilder");
const AdminUser = require("../models/AdminUser");
const SESSION_EVENTS = require("../constants/SessionEvents");
const UserSession = require("../models/UserSession");
const userSessionRepo = require("../repositories/UserSessionRepository");
const bcrypt = require("bcryptjs");
const mailUtil = require("../utils/MailUtil");
const crypto = require("crypto");
const mongoose = require("mongoose");
const redisClient = require("../config/RedisConfig");
const DataConstant = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  NO_CONTENT: 204,
  SERVER_ERROR: 500,

  SHORT_ZERO: 0,
  SHORT_ONE: 1,
  SHORT_TWO: 2,

  ROLE_CREATED: "Role created successfully",
  ROLE_UPDATED: "Role updated successfully",
  ROLE_DELETED: "Role deleted successfully",
  ROLE_ACTIVE: "Role activated successfully",
  ROLE_INACTIVE: "Role inactivated successfully",
  ROLE_NOT_FOUND: "Role not found",
  ROLE_MODULE_NOT_FOUND: "RoleModule not found",
  MODULE_NOT_FOUND: "Module not found",
  ROLE_BAD_REQUEST: "Invalid Role request",
  RECORD_FOUND: "Record found",
  RECORD_NOT_FOUND: "No records found",
  PAGINATION_REQUIRED: "Pagination params are required",
  SERVER_MESSAGE: "Internal Server Error",
  ROLE_ALREADY_ACTIVE: "Role is already active",
  ROLE_ALREADY_INACTIVE: "Role is already inactive",
  INVALID_REQUEST: "Invalid request"
};

async function addAdmin(data) {
  let uploadedImageKey = null;

  try {
    if (!data) {
      logger.error("addAdmin: No data provided");
      return buildResponse(400, "Invalid request: no data provided", null);
    }

    logger.info(`addAdmin: userId=${data.id || "NEW_USER"}`);

    const isCreate = !data.id || data.id.trim() === "";
    let existingUser = null;

    if (isCreate) {
      existingUser = await adminUserRepo.findByEmail(data.email);
      if (existingUser) {
        return buildResponse(409, "Email already exists", null);
      }
    } else {
      existingUser = await adminUserRepo.findById(data.id);
      if (!existingUser) {
        return buildResponse(404, "User not found", null);
      }
    }

    if (data.imageFile) {
      const uploaded = await s3Util.uploadFile(
        data.imageFile,
        "admin-users/profile-images"
      );
      uploadedImageKey = uploaded.key;
      logger.info("Admin profile image uploaded to S3", {
        key: uploadedImageKey
      });
    }

    let encryptedPassword = null;

    // Encrypt password only if provided
    if (data.password && data.password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      encryptedPassword = await bcrypt.hash(data.password, salt);
    }

    const {
      id: _id,
      imageFile: _imageFile,
      image: _legacyImage,
      profileUrl: _profileUrl,
      ...allowedData
    } = data;

    const safeUpdates = {
      ...allowedData,
      updatedAt: new Date()
    };

    // Empty form values cannot be cast to ObjectId. Treat an explicitly
    // cleared role as null while leaving an omitted role unchanged on update.
    if (Object.prototype.hasOwnProperty.call(data, "roleId")) {
      safeUpdates.roleId = data.roleId && String(data.roleId).trim()
        ? String(data.roleId).trim()
        : null;
    }

    if (uploadedImageKey) {
      safeUpdates.profileImageKey = uploadedImageKey;
      safeUpdates.profileUrl = null;
    }

    // Store encrypted password
    if (encryptedPassword) {
      safeUpdates.password = encryptedPassword;
    }

    let user;

    // CREATE USER
    if (isCreate) {
      user = await adminUserRepo.createUser(safeUpdates);

      logger.info(`Created new user with id=${user._id}`);

      return buildResponse(
        201,
        "User created successfully",
        await buildUserResponse(user)
      );
    }

    // UPDATE USER
    user = await adminUserRepo.updateUser(data.id, safeUpdates);

    if (
      uploadedImageKey &&
      existingUser.profileImageKey &&
      existingUser.profileImageKey !== uploadedImageKey
    ) {
      await s3Util.deleteFile(existingUser.profileImageKey).catch(error => {
        logger.warn("Unable to delete replaced admin profile image", {
          key: existingUser.profileImageKey,
          error: error.message
        });
      });
    }

    return buildResponse(
      200,
      "User profile updated successfully",
      await buildUserResponse(user)
    );

  } catch (err) {
    if (uploadedImageKey) {
      await s3Util.deleteFile(uploadedImageKey).catch(() => null);
    }
    logger.error(`addAdmin error: ${err.message}`, {
      stack: err.stack,
    });

    return buildResponse(500, err.message, null);
  }
}


async function loginAdmin(data) {
  try {

    if (!data.email || !data.password) {
      return buildResponse(
        400,
        "Email and password are required",
        null
      );
    }

    // Find user by email
    const user = await adminUserRepo.findByEmail(data.email);

    if (!user) {
      return buildResponse(
        404,
        "Invalid email or password",
        null
      );
    }

    if (user.status === 2) {
      return buildResponse(
        403,
        "Your account is inactive. Please contact admin.",
        null
      );
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.password
    );

    if (!isPasswordValid) {
      return buildResponse(
        401,
        "Invalid email or password",
        null
      );
    }

    const userWithRole = await buildUserRoleResponse(user);
        
    const token = jwtUtil.generate({
      purpose: "ADMIN_ACCESS",
      adminUserId: String(user._id),
      email: user.email,
    });
    // 5️⃣ Return success response
    return buildResponse(200, "Login successfully", {
      accessToken:token,
      userResponse: userWithRole
    });

    

  } catch (err) {

    logger.error(`loginAdmin error: ${err.message}`, {
      stack: err.stack,
    });

    return buildResponse(
      500,
      err.message,
      null
    );
  }
}

// 🟢 Get user by mobile
async function findByCountryCodeAndMobileNumber(countryCode, mobileNumber) {
  logger.info(`findByCountryCodeAndMobileNumber: ${countryCode}${mobileNumber}`);
  try {
    const user = await adminUserRepo.findByCountryCodeAndMobileNumber(
      countryCode,
      mobileNumber
    );

    if (!user) {
      logger.warn(`⚠️ No user found for ${countryCode}${mobileNumber}`);
      return buildResponse(404, "User not found, Please contact admin.", null);
    }

    logger.info(`✅ User exists`);
    return buildResponse(200, "Record Found Successfully.", user);
  } catch (error) {
    logger.error(
      `❌ Error in findByCountryCodeAndMobileNumber for ${countryCode}${mobileNumber}: ${error.message}`,
      { stack: error.stack }
    );
    return buildResponse(500, "Internal Server Error.", null);
  }
}



// 🟢 Get profile
async function getProfile(id) {
  logger.info(`getProfile: id=${id}`);
  try {
    const user = await adminUserRepo.findById(id);
    if (user) {
      const userWithRole = await buildUserRoleResponse(user); // 🔥 await here
      return buildResponse(200, "Record found successfully", userWithRole);
    } else {
      return buildResponse(404, "Record not found", null);
    }
  } catch (error) {
    logger.error("Internal server error", { error });
    return buildResponse(500, "Server Error", null);
  }
}


async function getAllUsers({ pageIndex, pageSize, status, searchText }) {
  logger.info("getAllUsers called", { pageIndex, pageSize, status, searchText });

  try {

    let query = {
    status: { $in: [DataConstant.SHORT_ONE, DataConstant.SHORT_TWO] },
    };

    // Convert status to integer if it’s a string
    if (status !== undefined && status !== null && status !== "") {
      console.log("🟡 Received status:", status);

      const parsedStatus = parseInt(status, 10);

      if (!isNaN(parsedStatus)) {
        console.log("✅ Parsed status as integer:", parsedStatus);
        query.status = parsedStatus;
      } else {
        console.warn("⚠️ Invalid status value, not a number:", status);
      }
    } else {
      console.info("ℹ️ No status provided, using default query:", query.status);
    }


    if (searchText && searchText.trim() !== "") {
      logger.info(`Searching users with text="${searchText}"`);
      query.$or = [
        { name: { $regex: searchText.trim(), $options: "i" } }
      ];
    } else {
      logger.info("Fetching all users without search filter");
    }

    const skip = pageIndex * pageSize;
    logger.info(`Pagination applied: skip=${skip}, limit=${pageSize}`);

    const [users, totalRecords, totalActive, totalInActive] = await Promise.all([
      adminUserRepo.findAllUsers(query, skip, pageSize),
      adminUserRepo.countDocuments(query),
      adminUserRepo.countDocuments({ status: 1 }),
      adminUserRepo.countDocuments({ status: 2 })
    ]);

    if (users && users.length > 0) {
      logger.info(`✅ Found ${users.length} users`);

      // Role and role modules are populated by the repository. The response
      // builder is asynchronous because it also generates S3 profile URLs.
      const userResponses = await Promise.all(
        users.map(user => buildUserRoleResponse(user))
      );

      return buildResponse(200, "Records fetched successfully", {
        content: userResponses,
        pageIndex,
        pageSize,
        totalRecords,
        totalActive,
        totalInActive,
        totalPages: Math.ceil(totalRecords / pageSize),
        isLast: pageIndex + 1 >= Math.ceil(totalRecords / pageSize),
        hasNext: pageIndex + 1 < Math.ceil(totalRecords / pageSize),
        hasPrevious: pageIndex > 0,
        
      });
    } else {
      logger.warn("⚠️ No users found");
      return buildResponse(404, "Records not found", null);
    }
  } catch (error) {
    logger.error("❌ getAllUsers service error", { error });
    return buildResponse(500, "Internal server error", null);
  }
}



// 🟢 Request OTP
async function requestOtp(countryCode, mobileNumber) {
  logger.info(`requestOtp for ${countryCode}${mobileNumber}`);

      // 1️⃣ Check if user already exists
  const user = await AdminUser.findOne({ countryCode, mobileNumber });

  if (user) {
    // 2️⃣ If user inactive (status = 2)
    if (user.status === 2) {
      return buildResponse(
        403,
        "Your account is inactive. Please contact administrator.",
        null
      );
    }
  }
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  await redis.set(`otp:${countryCode}${mobileNumber}`, otp, "EX", 60 * 5);

  if (process.env.NODE_ENV !== "production") {
    logger.info(`[DEV OTP] ${countryCode}${mobileNumber} -> ${otp}`);
  }

  return buildResponse(200, "OTP sent successfully", otp);
}

// 🟢 Verify OTP
async function verifyOtp(countryCode, mobileNumber, otp, deviceType, deviceToken) {
  const key = `otp:${countryCode}${mobileNumber}`;
  logger.info(`verifyOtp for ${key}`);

  try {
    // 1️⃣ Check OTP in Redis
    const stored = await redis.get(key);
    if (!stored || stored !== otp) {
      logger.warn(`verifyOtp: invalid or expired OTP for ${key}`);
      await userSessionRepo.createSession({
        eventType: SESSION_EVENTS.LOGIN_FAILED.type,
        description: SESSION_EVENTS.LOGIN_FAILED.desc,
        deviceType,
        deviceToken,
      });
      return buildResponse(401, "Invalid or expired OTP", null);
    }

    // 2️⃣ Check if user exists
    const userResponse = await findByCountryCodeAndMobileNumber(
      countryCode,
      mobileNumber
    );

    if (userResponse.responseCode !== 200) {
      return buildResponse(
        404,
        "Given mobile number doesn't exist",
        null
      );
    }

    const user = userResponse.responseBody;

    
    
    // 3️⃣ If OTP valid & user found → generate JWT token
    const token = jwtUtil.generate({
      purpose: "ADMIN_ACCESS",
      adminUserId: String(user._id),
      countryCode: user.countryCode,
      mobileNumber: user.mobileNumber,
    });

    logger.info(`✅ OTP verified for ${key}`);


    
    try{
        await userSessionRepo.createSession({
          userId: user._id,
          deviceType,
          deviceToken,
          sessionToken: token,
          loginAt: new Date(),
          isActive: true,
          eventType: SESSION_EVENTS.LOGIN_SUCCESS.type,
          description: SESSION_EVENTS.LOGIN_SUCCESS.desc,
        });

    }catch(err){
        logger.info(`Error occurs on user session creation ${err}`);
    }
    // 4️⃣ Delete OTP from Redis after successful verification
    await redis.del(key);

    const userWithRole = await buildUserRoleResponse(user);
    // 5️⃣ Return success response
    return buildResponse(200, "OTP verified successfully", {
      accessToken:token,
      userResponse: userWithRole
    });
    
  } catch (error) {
    logger.error(`❌ Error in verifyOtp for ${key}: ${error.message}`, {
      stack: error.stack,
    });
    return buildResponse(500, "Internal Server Error", null);
  }
}

// ✅ Block/Unblock/Delete User
async function blockUnblockUser(id, status) {
  try {
    logger.info(`📝 blockUnblockUser called for ID: ${id} with status: ${status}`);

    const adminUser = await AdminUser.findById(id);
    if (!adminUser) {
      logger.warn(`⚠️ User not found with ID: ${id}`);
      return buildResponse(404, "Record not found.");
    }

    // Check current status
    if (adminUser.status === status) {
      if (status === 1) {
        logger.info(`ℹ️ User ${id} already active`);
        return buildResponse(400, "User already active.");
      }
      if (status === 2) {
        logger.info(`ℹ️ User ${id} already inactive`);
        return buildResponse(400, "User already inactive");
      }
    }

    // Update status
    const oldStatus = adminUser.status;
    adminUser.status = status;
    await adminUser.save();
    logger.info(`✅ User ${id} status changed from ${oldStatus} to ${status}`);

    let message = "Invalid Request.";
    if (status === 0) message = "User deleted successfully.";
    if (status === 1) message = "User activated successfully.";
    if (status === 2) message = "User deactivated successfully.";

    logger.info(`ℹ️ Response message for user ${id}: ${message}`);
    return buildResponse(200, message, await buildUserResponse(adminUser));
  } catch (err) {
    logger.error(`❌ Error in blockUnblockUser for ID ${id}: ${err.stack || err.message}`);
    return buildResponse(500, "Internal Server Error!!", null);
  }
}



// 🟢 Upload profile pic
async function uploadProfile(file) {
  try {
    if (!file) {
      logger.warn("uploadProfile: file missing");
      return buildResponse(400, "File required", null);
    }

    const uploaded = await s3Util.uploadFile(file, "admin-users/uploads");
    const url = await s3Util.getPreSignedUrl(uploaded.key);

    logger.info("Admin file uploaded to S3", { key: uploaded.key });

    return buildResponse(201, "File uploaded successfully", {
      url,
      key: uploaded.key,
      originalName: file.originalname,
    });
  } catch (err) {
    logger.error(`uploadProfile error: ${err.message}`);
    return buildResponse(500, "Internal server error", null);
  }
}

async function uploadMultipleFiles(files) {
  try {
    if (!files || files.length === 0) {
      logger.warn("uploadMultipleFiles: no files provided");
      return buildResponse(400, "At least one file required", null);
    }

    const uploadedFiles = [];
    for (const file of files) {
      const uploaded = await s3Util.uploadFile(file, "admin-users/uploads");
      uploadedFiles.push({
        key: uploaded.key,
        url: await s3Util.getPreSignedUrl(uploaded.key),
        originalName: file.originalname,
        size: file.size
      });
    }

    logger.info(`uploadMultipleFiles: ${files.length} files uploaded successfully`);

    return buildResponse(201, "Files uploaded successfully", uploadedFiles);
  } catch (err) {
    logger.error(`uploadMultipleFiles error: ${err.message}`);
    return buildResponse(500, "Internal server error", null);
  }
}

async function getTotalUserCount() {
  try {
    const totalUserCount = await AdminUser.countDocuments({
      status: { $ne: 0 },
    });

     return buildResponse(200, "Successfully fetched!!", totalUserCount);
    
  } catch (error) {
    logger.error("❌ Error fetching user count", {
      error: error.message
    });
    return buildResponse(500, "Internal Server Error!!", error.message);
  }
}


/**
 * Get all user sessions with pagination & filters
 */
async function getAllUserSessions({
  pageIndex = 0,
  pageSize = 10,
  searchText = "",
}) {
  try {
    let sessionQuery = {};

    const skip = pageIndex * pageSize;

    // 🔹 Aggregate to merge User + Session
    const sessions = await UserSession.aggregate([
      { $match: sessionQuery },

      // Join user data
      {
        $lookup: {
          from: "admin_users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // 🔹 Optional search
      ...(searchText
        ? [
            {
              $match: {
                $or: [
                  { "user.name": { $regex: searchText, $options: "i" } },
                  { "user.email": { $regex: searchText, $options: "i" } },
                  {
                    "user.mobileNumber": {
                      $regex: searchText,
                      $options: "i",
                    },
                  },
                ],
              },
            },
          ]
        : []),

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },

      // 🔹 Shape response
      {
        $project: {
          _id: 0,
          sessionId: "$_id",
          eventType: 1,
          description: 1,
          isActive: 1,

          loginAt: {
            $dateToString: {
              format: "%d-%m-%Y %H:%M:%S",
              date: "$loginAt",
            },
          },
          logoutAt: {
            $cond: [
              { $ifNull: ["$logoutAt", false] },
              {
                $dateToString: {
                  format: "%d-%m-%Y %H:%M:%S",
                  date: "$logoutAt",
                },
              },
              null,
            ],
          },

          deviceType: 1,
          ipAddress: 1,

          user: {
            id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            mobileNumber: "$user.mobileNumber",
            countryCode: "$user.countryCode",
            profileUrl: "$user.profileUrl",
            status: "$user.status",
          },
        },
      }

      ,
    ]);

    // 🔹 Count total
    const total = await UserSession.countDocuments(sessionQuery);

    // 🔹 Stats
    const totalLoginSuccess = await UserSession.countDocuments({
      eventType: "LOGIN_SUCCESS",
    });

    const totalLoginFailed = await UserSession.countDocuments({
      eventType: "LOGIN_FAILED",
    });

    const totalActiveSessions = await UserSession.countDocuments({
      isActive: true,
    });

    if (!sessions || sessions.length === 0) {
      return buildResponse(404, "Records not found", null);
    }

    return buildResponse(200, "Records fetched successfully", {
      content: sessions,
      pageIndex,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      isLast: pageIndex + 1 >= Math.ceil(total / pageSize),
      hasNext: pageIndex + 1 < Math.ceil(total / pageSize),
      hasPrevious: pageIndex > 0,

      // 🔹 Session stats
      totalLoginSuccess,
      totalLoginFailed,
      totalActiveSessions,
    });
  } catch (error) {
    logger.error("getAllUserSessions service error", { error });
    return buildResponse(500, "Internal server error", null);
  }
}

async function logout(token) {
  logger.info("Logout initiated", { token });

  try {
    // 🔹 Close active session using token
    const session = await userSessionRepo.closeSessionByToken(token);

    if (!session) {
      logger.warn("Logout attempted with invalid or expired session token", {
        token,
      });
      return buildResponse(401, "Invalid or expired session", null);
    }

    logger.info("Active session found for logout", {
      sessionId: session._id,
      userId: session.userId,
    });

    // 🔹 Update session audit info
    session.eventType = "LOGOUT";
    session.description = "User logout successfully";
    session.logoutAt = new Date();
    session.isActive = false;
    await session.save();

    logger.info("User session closed successfully", {
      sessionId: session._id,
      logoutAt: session.logoutAt,
    });



    logger.info("Logout completed successfully", {
      userId: session.userId,
    });

    return buildResponse(200, "Logout successful", null);
  } catch (err) {
    logger.error("Logout failed due to server error", {
      token,
      error: err.message,
      stack: err.stack,
    });
    return buildResponse(500, "Logout failed", null);
  }
}

function getPortalContactDetails() {
  return {
    email:
      process.env.CONTACT_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      "contactus@kalotacommunityapp.com",
    phone:
      process.env.CONTACT_PHONE ||
      "",
    address:
      process.env.CONTACT_ADDRESS ||
      "",
  };
}

function buildForgotPasswordEmailTemplate({
  title,
  greetingName,
  message,
  otp,
  actionUrl,
  actionText,
  validityText,
}) {
  const contact =
    getPortalContactDetails();

  const currentYear =
    new Date().getFullYear();

  const contactPhoneHtml =
    contact.phone
      ? `<div style="margin-top:4px;">Phone: <a href="tel:${contact.phone}" style="color:#8b1e3f;text-decoration:none;">${contact.phone}</a></div>`
      : "";

  const contactAddressHtml =
    contact.address
      ? `<div style="margin-top:4px;">${contact.address}</div>`
      : "";

  const otpHtml =
    otp
      ? `
        <div style="margin:28px 0;text-align:center;">
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:10px;">
            Your verification code
          </div>
          <div style="display:inline-block;background:#fff7f9;border:1px solid #f4c7d3;border-radius:16px;padding:18px 28px;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;color:#0f172a;">
            ${otp}
          </div>
        </div>
      `
      : "";

  const actionHtml =
    actionUrl
      ? `
        <div style="margin:28px 0;text-align:center;">
          <a href="${actionUrl}" style="display:inline-block;background:#8b1e3f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:999px;box-shadow:0 10px 24px rgba(139,30,63,0.24);">
            ${actionText || "Reset Password"}
          </a>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-top:18px;">
          <div style="font-size:13px;color:#64748b;margin-bottom:8px;">If the button does not work, copy and paste this link into your browser:</div>
          <a href="${actionUrl}" style="font-size:13px;color:#8b1e3f;word-break:break-all;text-decoration:none;">${actionUrl}</a>
        </div>
      `
      : "";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;margin:0;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 50px rgba(15,23,42,0.10);">
                <tr>
                  <td style="background:linear-gradient(135deg,#4a1026 0%,#8b1e3f 58%,#b9405f 100%);padding:34px 32px;color:#ffffff;">
                    <div style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.86;">
                      Kalota Family Community Portal
                    </div>
                    <h1 style="margin:12px 0 0;font-size:28px;line-height:1.25;font-weight:800;">
                      ${title}
                    </h1>
                    <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#fde2e9;">
                      Secure account assistance for your community portal.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:34px 32px 28px;">
                    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">
                      Hello ${greetingName || "Admin"},
                    </p>
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#334155;">
                      ${message}
                    </p>

                    ${otpHtml}
                    ${actionHtml}

                    <div style="margin-top:26px;background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:16px 18px;">
                      <div style="font-size:14px;font-weight:800;color:#9a3412;margin-bottom:6px;">
                        Security note
                      </div>
                      <div style="font-size:14px;line-height:1.7;color:#7c2d12;">
                        ${validityText} Please do not share this email, code, or link with anyone. If you did not request this password reset, you can safely ignore this message.
                      </div>
                    </div>

                    <div style="margin-top:26px;border-top:1px solid #e2e8f0;padding-top:22px;">
                      <div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:8px;">
                        Contact us
                      </div>
                      <div style="font-size:14px;line-height:1.7;color:#475569;">
                        Need help? Contact the Kalota Family Community Portal support team.
                        <div style="margin-top:4px;">Email: <a href="mailto:${contact.email}" style="color:#8b1e3f;text-decoration:none;">${contact.email}</a></div>
                        ${contactPhoneHtml}
                        ${contactAddressHtml}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
                    <div style="font-size:12px;line-height:1.6;color:#64748b;">
                      © ${currentYear} Kalota Family Community Portal. All rights reserved.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function forgotPasswordOtp(data) {
  try {

    if (!data.email) {
      return buildResponse(
        400,
        "Email is required",
        null
      );
    }

    const email = data.email.toLowerCase();

    // Check User
    const user = await AdminUser.findOne({ email });

    if (!user) {
      return buildResponse(
        404,
        "User not found",
        null
      );
    }

    // Generate OTP
    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Redis Key
    const redisKey = `RESET_OTP:${email}`;

    /**
     * Store OTP in Redis
     * EX = expiry in seconds
     */
    await redisClient.set(
      redisKey,
      otp,
      "EX",
      600 // 10 mins
    );

    
    try{
      // Send Email
    await mailUtil.sendMail(
      email,
      "Kalota Family Community Portal - Password Reset OTP",
      buildForgotPasswordEmailTemplate({
        title: "Password Reset OTP",
        greetingName: user.name,
        message:
          "We received a request to reset the password for your admin account. Use the verification code below to continue.",
        otp,
        validityText:
          "This OTP is valid for 10 minutes.",
      })
    );

    }catch(err){
      logger.error(
        "Exception occurs while sending forgot password OTP mail",
        {
          error: err.message,
          stack: err.stack,
          email,
        }
      );
    }

    

    return buildResponse(
      200,
      "OTP sent successfully",
      otp
    );

  } catch (err) {

    logger.error(
      `forgotPasswordOtp error: ${err.message}`
    );

    return buildResponse(
      500,
      err.message,
      null
    );
  }
}

async function resetPasswordWithOtp(data) {
  try {

    const {
      email,
      otp,
      newPassword
    } = data;

    if (!email || !otp || !newPassword) {
      return buildResponse(
        400,
        "Email, OTP and newPassword required",
        null
      );
    }

    const lowerEmail = email.toLowerCase();

    // Find User
    const user = await AdminUser.findOne({
      email: lowerEmail
    });

    if (!user) {
      return buildResponse(
        404,
        "User not found",
        null
      );
    }

    // Redis Key
    const redisKey = `RESET_OTP:${lowerEmail}`;

    // Get OTP from Redis
    const storedOtp =
      await redisClient.get(redisKey);

    if (!storedOtp) {
      return buildResponse(
        400,
        "OTP expired",
        null
      );
    }

    // Validate OTP
    if (storedOtp !== otp) {
      return buildResponse(
        400,
        "Invalid OTP",
        null
      );
    }

    // Encrypt Password
    const salt = await bcrypt.genSalt(10);

    user.password = await bcrypt.hash(
      newPassword,
      salt
    );

    await user.save();

    // Delete OTP after success
    await redisClient.del(redisKey);

    return buildResponse(
      200,
      "Password reset successful",
      null
    );

  } catch (err) {

    logger.error(
      `resetPasswordWithOtp error: ${err.message}`
    );

    return buildResponse(
      500,
      err.message,
      null
    );
  }
}

async function forgotPasswordLink(data) {
  try {

    if (!data.email) {
      return buildResponse(
        400,
        "Email is required",
        null
      );
    }

    const user = await AdminUser.findOne({
      email: data.email.toLowerCase(),
    });

    if (!user) {
      return buildResponse(
        404,
        "User not found",
        null
      );
    }

    // Generate Token
    const resetToken = crypto
      .randomBytes(32)
      .toString("hex");

    user.resetToken = resetToken;

    // 30 mins expiry
    user.resetTokenExpiry = new Date(
      Date.now() + 30 * 60 * 1000
    );

    await user.save();

    const resetLink =
      `${process.env.FRONTEND_URL}` +
      `/reset-password?token=${resetToken}`;


      try{

            // Send Email
    await mailUtil.sendMail(
      user.email,
      "Kalota Family Community Portal - Reset Your Password",
      buildForgotPasswordEmailTemplate({
        title: "Reset Your Password",
        greetingName: user.name,
        message:
          "We received a request to reset the password for your admin account. Click the secure button below to create a new password.",
        actionUrl: resetLink,
        actionText: "Reset Password",
        validityText:
          "This reset link is valid for 30 minutes.",
      })
    );
      }catch(err){
        logger.error(
          "Exception occurs while sending forgot password link mail",
          {
            error: err.message,
            stack: err.stack,
            email: user.email,
          }
        );
      }

    return buildResponse(
      200,
      "Reset password link sent successfully",
      resetLink
    );

  } catch (err) {

    logger.error("forgotPasswordLink error", err);

    return buildResponse(
      500,
      err.message,
      null
    );
  }
}

async function resetPasswordUsingLink(data) {
  try {

    const { token, newPassword } = data;

    if (!token || !newPassword) {
      return buildResponse(
        400,
        "Token and newPassword required",
        null
      );
    }

    const user = await AdminUser.findOne({
      resetToken: token,
    });

    if (!user) {
      return buildResponse(
        400,
        "Invalid reset token",
        null
      );
    }

    // Expiry Check
    if (new Date() > user.resetTokenExpiry) {
      return buildResponse(
        400,
        "Reset token expired",
        null
      );
    }

    // Encrypt Password
    const salt = await bcrypt.genSalt(10);

    user.password = await bcrypt.hash(
      newPassword,
      salt
    );

    // Clear Token
    user.resetToken = null;
    user.resetTokenExpiry = null;

    await user.save();

    return buildResponse(
      200,
      "Password reset successful",
      null
    );

  } catch (err) {

    logger.error(
      "resetPasswordUsingLink error",
      err
    );

    return buildResponse(
      500,
      err.message,
      null
    );
  }
}

async function changePassword(data) {
  try {
    const {
      id,
      existingPassword,
      newPassword,
    } = data;

    if (!id) {
      return buildResponse(
        400,
        "id is required",
        null
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return buildResponse(
        400,
        "Invalid id",
        null
      );
    }

    if (!existingPassword) {
      return buildResponse(
        400,
        "existingPassword is required",
        null
      );
    }

    if (!newPassword) {
      return buildResponse(
        400,
        "newPassword is required",
        null
      );
    }

    const trimmedExistingPassword =
      String(existingPassword).trim();
    const trimmedNewPassword =
      String(newPassword).trim();

    if (!trimmedExistingPassword) {
      return buildResponse(
        400,
        "existingPassword cannot be empty",
        null
      );
    }

    if (!trimmedNewPassword) {
      return buildResponse(
        400,
        "newPassword cannot be empty",
        null
      );
    }

    if (trimmedExistingPassword === trimmedNewPassword) {
      return buildResponse(
        400,
        "newPassword must be different from existingPassword",
        null
      );
    }

    if (trimmedNewPassword.length < 6) {
      return buildResponse(
        400,
        "newPassword must be at least 6 characters",
        null
      );
    }

    const user =
      await AdminUser.findById(
        id
      );

    if (!user) {
      return buildResponse(
        404,
        "Admin user not found",
        null
      );
    }

    if (user.status === 2) {
      return buildResponse(
        403,
        "Your account is inactive. Please contact admin.",
        null
      );
    }

    const isOldPasswordValid =
      await bcrypt.compare(
        trimmedExistingPassword,
        user.password
      );

    if (!isOldPasswordValid) {
      return buildResponse(
        401,
        "existingPassword is incorrect",
        null
      );
    }

    const salt =
      await bcrypt.genSalt(10);

    user.password =
      await bcrypt.hash(
        trimmedNewPassword,
        salt
      );
    user.updatedAt = new Date();

    await user.save();

    return buildResponse(
      200,
      "Password changed successfully",
      null
    );
  } catch (err) {
    logger.error("changePassword error", {
      error: err.message,
      stack: err.stack,
      request: {
        id: data?.id,
      },
    });

    return buildResponse(
      500,
      err.message,
      null
    );
  }
}

module.exports = {
  forgotPasswordOtp,
  resetPasswordWithOtp,
  forgotPasswordLink,
  resetPasswordUsingLink,
  changePassword,
  addAdmin,
  findByCountryCodeAndMobileNumber,
  getProfile,
  getAllUsers,
  requestOtp,
  verifyOtp,
  uploadProfile,
  uploadMultipleFiles,
  blockUnblockUser,
  getTotalUserCount,
  getAllUserSessions,
  loginAdmin,
  logout
};
