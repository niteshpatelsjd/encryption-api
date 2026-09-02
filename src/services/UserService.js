const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const userRepo = require("../repositories/UserRepository");
const notificationRepo = require("../repositories/NotificationRepository");
const redis = require("../config/RedisConfig");
const jwtUtil = require("../utils/JwtUtil");
const fileUtil = require("../utils/FileUtil");
const s3Util = require("../utils/s3Util");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");
const mailUtil = require("../utils/MailUtil");
const { buildAppUserResponse } = require("../utils/ResponseBuilder");

const DataConstant = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SERVER_ERROR: 500,
  
  UNAUTHORIZED: 401,

  USER_CREATED: "User registered successfully",
  PROFILE_UPDATED: "Profile updated successfully",
  USER_NOT_FOUND: "User not found",
  EMAIL_ALREADY_EXISTS: "Email already exists",
  MOBILE_ALREADY_EXISTS: "Mobile number already exists",
  INVALID_REQUEST: "Invalid request",
  INVALID_OTP: "Invalid or expired OTP",
  EMAIL_VERIFIED: "Email verified successfully",
  ORGANIZATION_NOT_FOUND: "Organization not found",
  ORGANIZATION_JOINED: "Organization joined successfully",
  RECORDS_FETCHED: "Records fetched successfully",
  RECORDS_NOT_FOUND: "Records not found",
  SERVER_MESSAGE: "Internal Server Error"
};


async function login(loginRequest) {

    logger.info("login service called", {
        email: loginRequest?.email
    });

    try {

        const email = loginRequest.email?.trim().toLowerCase();
        const password = loginRequest.password;
        const deviceToken = loginRequest.deviceToken;
        const deviceType = loginRequest.deviceType;

        if (!email || !password || !deviceToken || !deviceType) {

            logger.warn("login validation failed");

            return buildResponse(
                DataConstant.BAD_REQUEST,
                DataConstant.INVALID_REQUEST
            );
        }

        // ======================================
        // Find User
        // ======================================

        const user = await userRepo.findByEmail(email);

        if (!user) {

            logger.warn("User not found", { email });

            return buildResponse(
                DataConstant.UNAUTHORIZED,
                "Invalid Email Or Password"
            );
        }

        // ======================================
        // Email Verification
        // ======================================

        if (!user.isEmailVerified) {

            const otp = generateOtp();

            await redis.set(
                `email_otp:${user.email}`,
                otp,
                "EX",
                10 * 60
            );

            await mailUtil.sendEmailOtp(
                user.email,
                otp
            );
        }

        // ======================================
        // Account Status
        // ======================================

        if (user.status !== 1) {

            return buildResponse(
                DataConstant.UNAUTHORIZED,
                "Your account has been blocked."
            );
        }

        // ======================================
        // Password Validation
        // ======================================

        const isPasswordMatched =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!isPasswordMatched) {

            logger.warn(
                "Invalid password",
                { email }
            );

            return buildResponse(
                DataConstant.UNAUTHORIZED,
                "Invalid Email Or Password"
            );
        }

        // ======================================
        // Update Login Details
        // ======================================

        await userRepo.updateLoginDetails(
            user._id,
            deviceToken,
            deviceType
        );

        // ======================================
        // Generate Access Token
        // ======================================

        const accessToken = jwtUtil.generate({
            userId: user._id,
            emailId: user.email
        });

        // ======================================
        // Get User Organizations
        // ======================================

        const memberships =
            await OrganizationMember.find({
                userId: user._id,
                status: 2
            })
            .select("organizationId")
            .lean();

        const organizationIds =
            memberships.map(
                member => member.organizationId
            );

        const groupCount =
            organizationIds.length;

        logger.info(
            "User organization count fetched",
            {
                userId: user._id,
                groupCount,
                organizationIds
            }
        );

        // ======================================
        // Get Event Count
        // ======================================

        let eventCount = 0;
        let alertCount = 0;

        if (organizationIds.length > 0) {

            [
                eventCount,
                alertCount
            ] = await Promise.all([

                notificationRepo.countDocuments({
                    organizationId: {
                        $in: organizationIds
                    },
                    status: {
                        $ne: 0
                    },
                    type: "EVENT"
                }),

                notificationRepo.countDocuments({
                    organizationId: {
                        $in: organizationIds
                    },
                    status: {
                        $ne: 0
                    },
                    type: "ALERT"
                })

            ]);
        }

        logger.info(
            "User notification counts fetched",
            {
                userId: user._id,
                groupCount,
                eventCount,
                alertCount
            }
        );

        // ======================================
        // Login Response
        // ======================================

        logger.info(
            "User login successful",
            {
                userId: user._id,
                groupCount,
                eventCount,
                alertCount
            }
        );

        return buildResponse(
            DataConstant.OK,
            "Login Successful",
            {
                accessToken,

                alertCount,

                eventCount,

                groupCount,

                userResponse:
                    await buildAppUserResponse(user)
            }
        );

    } catch (error) {

        logger.error(
            "login service error",
            {
                error: error.message,
                stack: error.stack
            }
        );

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE
        );
    }
}



async function forgotPassword(request) {

    logger.info("forgotPassword service called", {
        email: request?.email
    });

    try {

        const email = request.email?.trim().toLowerCase();

        if (!email) {

            logger.warn("forgotPassword validation failed");

            return buildResponse(
                DataConstant.BAD_REQUEST,
                DataConstant.INVALID_REQUEST
            );
        }

        const user = await userRepo.findByEmail(email);

        if (!user) {

            logger.warn("forgotPassword user not found", {
                email
            });

            return buildResponse(
                DataConstant.NOT_FOUND,
                "User not found."
            );
        }

        if (user.status !== 1) {

            return buildResponse(
                DataConstant.UNAUTHORIZED,
                "Your account has been blocked."
            );
        }

        const otp = generateOtp();

        await redis.set(
            `forgot_password_otp:${email}`,
            otp,
            "EX",
            600
        );

        await mailUtil.sendForgotPasswordOtp(
            email,
            otp
        );

        logger.info("Forgot password OTP sent", {
            email
        });

        return buildResponse(
            DataConstant.OK,
            "OTP sent successfully."
        );

    } catch (error) {

        logger.error("forgotPassword service error", {
            error: error.message,
            stack: error.stack
        });

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE
        );
    }
}

async function verifyForgotOtp(request) {

    logger.info("verifyForgotOtp service called", {
        email: request?.email
    });

    try {

        const email = request.email?.trim().toLowerCase();
        const otp = request.otp?.trim();

        if (!email || !otp) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                DataConstant.INVALID_REQUEST
            );
        }

        const user = await userRepo.findByEmail(email);

        if (!user) {

            return buildResponse(
                DataConstant.NOT_FOUND,
                "User not found."
            );
        }

        const redisOtp = await redis.get(
            `forgot_password_otp:${email}`
        );

        if (!redisOtp) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "OTP expired."
            );
        }

        if (redisOtp !== otp) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "Invalid OTP."
            );
        }

        await redis.del(
            `forgot_password_otp:${email}`
        );

        const resetToken = jwtUtil.generateResetPasswordToken({
            userId: user._id,
            emailId: user.email
        });

        logger.info("Forgot password OTP verified", {
            email
        });

        return buildResponse(
            DataConstant.OK,
            "OTP verified successfully.",
            {
                resetToken
            }
        );

    } catch (error) {

        logger.error("verifyForgotOtp service error", {
            error: error.message,
            stack: error.stack
        });

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE
        );
    }

}

async function resetPassword(request) {

    logger.info("resetPassword service called");

    try {

        const resetToken = request.resetToken;
        const newPassword = request.newPassword;

        logger.info("Validating reset password request");

        if (!resetToken || !newPassword) {

            logger.warn("Invalid reset password request: Missing resetToken or newPassword");

            return buildResponse(
                DataConstant.BAD_REQUEST,
                DataConstant.INVALID_REQUEST
            );
        }

        let payload;

        try {

            logger.info("Verifying reset token");

            payload = jwtUtil.verify(
                resetToken,
                process.env.JWT_SECRET
            );

            logger.info("Reset token verified successfully", {
                email: payload.emailId
            });

        } catch (error) {

            logger.warn("Reset token verification failed", {
                error: error.message
            });

            return buildResponse(
                DataConstant.UNAUTHORIZED,
                "Reset token is invalid or expired."
            );
        }

        logger.info("Searching user by email", {
            email: payload.emailId
        });

        const user = await userRepo.findByEmail(
            payload.emailId
        );

        if (!user) {

            logger.warn("User not found for password reset", {
                email: payload.emailId
            });

            return buildResponse(
                DataConstant.NOT_FOUND,
                "User not found."
            );
        }

        logger.info("User found", {
            userId: user._id,
            email: user.email
        });

        logger.info("Checking whether new password matches current password");

        const isSamePassword = await bcrypt.compare(
            newPassword,
            user.password
        );

        if (isSamePassword) {

            logger.warn("Password reset rejected: New password matches existing password", {
                userId: user._id
            });

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "New password cannot be the same as your current password."
            );
        }

        logger.info("Hashing new password", {
            userId: user._id
        });

        const hashedPassword = await bcrypt.hash(
            newPassword,
            10
        );

        logger.info("Updating user password", {
            userId: user._id
        });

        await userRepo.updatePassword(
            user._id,
            hashedPassword
        );

        logger.info("Password reset successful", {
            userId: user._id,
            email: user.email
        });

        return buildResponse(
            DataConstant.OK,
            "Password reset successfully."
        );

    } catch (error) {

        logger.error("resetPassword service error", {
            error: error.message,
            stack: error.stack
        });

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE
        );
    }
}


async function registerUser(userRequest) {
  logger.info("registerUser service called", {
    name: userRequest?.name,
    email: userRequest?.email,
    countryCode: userRequest?.countryCode,
    mobileNumber: userRequest?.mobileNumber
  });

  try {
    const name = userRequest.name?.trim();
    const email = userRequest.email?.trim().toLowerCase();
    const password = userRequest.password;
    const countryCode = userRequest.countryCode?.trim();
    const mobileNumber = userRequest.mobileNumber?.trim();

    if (!name || !email || !password ) {
      logger.warn("registerUser validation failed", { name, email, countryCode, mobileNumber });
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const existingEmail = await userRepo.findByEmail(email);
    if (existingEmail) {
      logger.warn("registerUser failed: email already exists", { email });
      return buildResponse(DataConstant.CONFLICT, DataConstant.EMAIL_ALREADY_EXISTS);
    }

    // const existingMobile = await userRepo.findByCountryCodeAndMobileNumber(countryCode, mobileNumber);
    // if (existingMobile) {
    //   logger.warn("registerUser failed: mobile already exists", { countryCode, mobileNumber });
    //   return buildResponse(DataConstant.CONFLICT, DataConstant.MOBILE_ALREADY_EXISTS);
    // }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      countryCode,
      mobileNumber,
      isEmailVerified: false,
      profileCompleted: false,
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const saved = await userRepo.save(user);
    const otp = generateOtp();
    await redis.set(`email_otp:${email}`, otp, "EX", 10 * 60);
    await mailUtil.sendEmailOtp(email, otp);

    const emailVerificationToken = jwtUtil.generate({ emailId: email });

    logger.info("registerUser completed", { id: saved._id, email });
    return buildResponse(DataConstant.CREATED, DataConstant.USER_CREATED, {
      userResponse: await buildAppUserResponse(saved),
      emailVerificationToken
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      logger.warn("registerUser failed: duplicate email key", {
        email: userRequest?.email
      });
      return buildResponse(DataConstant.CONFLICT, DataConstant.EMAIL_ALREADY_EXISTS);
    }

    logger.error("registerUser service error", { error: error.message, stack: error.stack });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function verifyEmailOtp({ token, otp }) {
  logger.info("verifyEmailOtp service called", { hasToken: !!token });

  try {
    if (!token || !otp) {
      logger.warn("verifyEmailOtp validation failed");
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const decoded = jwtUtil.verify(token);
    const email = decoded.emailId?.toLowerCase();

    if (!email) {
      logger.warn("verifyEmailOtp failed: emailId missing in token");
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const storedOtp = await redis.get(`email_otp:${email}`);
    if (!storedOtp || storedOtp !== otp) {
      logger.warn("verifyEmailOtp failed: invalid OTP", { email });
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_OTP);
    }

    const user = await userRepo.findByEmail(email);
    if (!user) {
      logger.warn("verifyEmailOtp failed: user not found", { email });
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.USER_NOT_FOUND);
    }

    user.isEmailVerified = true;
    user.updatedAt = new Date();
    const updated = await userRepo.save(user);
    await redis.del(`email_otp:${email}`);

    logger.info("verifyEmailOtp completed", { id: updated._id, email });
    return buildResponse(DataConstant.OK, DataConstant.EMAIL_VERIFIED, await buildAppUserResponse(updated));
  } catch (error) {
    logger.error("verifyEmailOtp service error", { error: error.message, stack: error.stack });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function updateProfile(profileRequest) {
  logger.info("updateProfile service called", {
    id: profileRequest?.id,
    email: profileRequest?.email,
    hasImage: !!profileRequest?.imageProfile
  });

  try {
    const { id } = profileRequest;
    if (!id) {
      logger.warn("updateProfile validation failed: id is required");
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const user = await userRepo.findById(id);
    if (!user) {
      logger.warn("updateProfile failed: user not found", { id });
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.USER_NOT_FOUND);
    }

    

    // if (profileRequest.imageProfile) {
    //   user.profileUrl = await fileUtil.uploadFile(profileRequest.imageProfile);
    // }

if (profileRequest.imageProfile) {

    // Upload the new image first
    const uploadResult = await s3Util.uploadFile(
        profileRequest.imageProfile,
        "profile"
    );

    // Delete the old image after successful upload
    if (user.profileImageKey) {
        try {
            await s3Util.deleteFile(user.profileImageKey);
        } catch (error) {
            logger.warn("Unable to delete old profile image", {
                error: error.message
            });
        }
    }

    // Save new image details
    //user.profileUrl = uploadResult.url;
    user.profileImageKey = uploadResult.key;
}

    if (profileRequest.name !== undefined) user.name = profileRequest.name?.trim();
    if (profileRequest.email !== undefined) user.email = profileRequest.email?.trim().toLowerCase();
    if (profileRequest.countryCode !== undefined) user.countryCode = profileRequest.countryCode?.trim();
    if (profileRequest.mobileNumber !== undefined) user.mobileNumber = profileRequest.mobileNumber?.trim();
    if (profileRequest.occupation !== undefined) user.occupation = profileRequest.occupation?.trim();
    if (profileRequest.gender !== undefined) user.gender = profileRequest.gender?.trim();

    user.profileCompleted = true;
    user.updatedAt = new Date();

    const updated = await userRepo.save(user);
    logger.info("updateProfile completed", { id: updated._id });

     
    return buildResponse(DataConstant.OK, DataConstant.PROFILE_UPDATED, await buildAppUserResponse(updated));
  } catch (error) {
    logger.error("updateProfile service error", { error: error.message, stack: error.stack });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function getProfile(id) {
  logger.info("getProfile service called", { id });

  try {
    if (!id) {
      logger.warn("getProfile validation failed: id is required");
      return buildResponse(DataConstant.BAD_REQUEST, DataConstant.INVALID_REQUEST);
    }

    const user = await userRepo.findById(id);
    if (!user) {
      logger.warn("getProfile failed: user not found", { id });
      return buildResponse(DataConstant.NOT_FOUND, DataConstant.USER_NOT_FOUND);
    }

    logger.info("getProfile completed", { id: user._id });
    return buildResponse(DataConstant.OK, "Record found", await buildAppUserResponse(user));
  } catch (error) {
    logger.error("getProfile service error", { error: error.message, stack: error.stack });
    return buildResponse(DataConstant.SERVER_ERROR, DataConstant.SERVER_MESSAGE);
  }
}

async function getAllUsers({
    pageIndex,
    pageSize,
    status,
    searchText,
    organizationId,
    memberStatus
}) {

    logger.info("getAllUsers service called", {
        pageIndex,
        pageSize,
        status,
        searchText,
        organizationId,
        memberStatus
    });

    try {

        // ======================================
        // Pagination Validation
        // ======================================

        pageIndex = parseInt(pageIndex || 0, 10);
        pageSize = parseInt(pageSize || 10, 10);

        if (pageIndex < 0) {
            pageIndex = 0;
        }

        if (pageSize <= 0) {
            pageSize = 10;
        }


        // ======================================
        // Base User Query
        // ======================================

        let query = {
            status: {
                $in: [1, 2]
            }
        };


        // ======================================
        // User Status Filter
        // ======================================

        if (
            status !== undefined &&
            status !== null &&
            status !== ""
        ) {

            const parsedStatus =
                parseInt(status, 10);

            if (isNaN(parsedStatus)) {

                return buildResponse(
                    DataConstant.BAD_REQUEST,
                    "Invalid user status",
                    null
                );

            }

            query.status = parsedStatus;

            logger.info(
                "getAllUsers status filter applied",
                {
                    status: parsedStatus
                }
            );
        }


        // ======================================
        // Organization Membership
        // ======================================

        let membershipMap = new Map();

        if (
            organizationId !== undefined &&
            organizationId !== null &&
            organizationId !== ""
        ) {

            const trimmedOrganizationId =
                organizationId.toString().trim();

            logger.info(
                "Organization filter applied",
                {
                    organizationId:
                        trimmedOrganizationId,
                    memberStatus
                }
            );


            // ======================================
            // Membership Query
            // ======================================

            const membershipQuery = {
                organizationId:
                    trimmedOrganizationId
            };


            // ======================================
            // Member Status Filter
            // ======================================
            //
            // 0 = Left by user
            // 1 = Pending
            // 2 = Approved
            // 3 = Removed
            // 4 = Rejected
            //
            // Optional
            // ======================================

            if (
                memberStatus !== undefined &&
                memberStatus !== null &&
                memberStatus !== ""
            ) {

                const parsedMemberStatus =
                    parseInt(memberStatus, 10);

                if (
                    isNaN(parsedMemberStatus) ||
                    ![0, 1, 2, 3, 4].includes(parsedMemberStatus)
                ) {

                    return buildResponse(
                        DataConstant.BAD_REQUEST,
                        "Invalid member status. Allowed values are 0, 1, 2, 3 and 4.",
                        null
                    );

                }

                membershipQuery.status =
                    parsedMemberStatus;

                logger.info(
                    "Organization member status filter applied",
                    {
                        organizationId:
                            trimmedOrganizationId,
                        memberStatus:
                            parsedMemberStatus
                    }
                );
            }


            // ======================================
            // Get Organization Memberships
            // ======================================

            const memberships =
                await OrganizationMember
                    .find(membershipQuery)
                    .select(
                        "userId status actionBy actionAt actionRemark joinedAt"
                    )
                    .lean();


            // ======================================
            // No Members
            // ======================================

            if (!memberships.length) {

                logger.warn(
                    "No organization members found",
                    {
                        organizationId:
                            trimmedOrganizationId,
                        memberStatus
                    }
                );

                return buildResponse(
                    DataConstant.NOT_FOUND,
                    DataConstant.RECORDS_NOT_FOUND,
                    null
                );
            }


            // ======================================
            // Create Organization User IDs
            // ======================================

            const organizationUserIds =
                memberships.map(
                    member => member.userId
                );


            // ======================================
            // Create Membership Map
            // ======================================

            memberships.forEach(member => {

                membershipMap.set(
                    member.userId.toString(),
                    member
                );

            });


            logger.info(
                "Organization memberships found",
                {
                    organizationId:
                        trimmedOrganizationId,

                    memberStatus,

                    memberCount:
                        memberships.length
                }
            );


            // ======================================
            // Filter Users By Organization
            // ======================================

            query._id = {
                $in: organizationUserIds
            };

        }


        // ======================================
        // Search Filter
        // ======================================

        if (
            searchText &&
            searchText.trim() !== ""
        ) {

            const trimmedSearchText =
                searchText.trim();

            query.$or = [

                {
                    name: {
                        $regex:
                            trimmedSearchText,
                        $options: "i"
                    }
                },

                {
                    email: {
                        $regex:
                            trimmedSearchText,
                        $options: "i"
                    }
                },

                {
                    mobileNumber: {
                        $regex:
                            trimmedSearchText,
                        $options: "i"
                    }
                },

                {
                    occupation: {
                        $regex:
                            trimmedSearchText,
                        $options: "i"
                    }
                }

            ];

        }


        // ======================================
        // Pagination
        // ======================================

        const skip =
            pageIndex * pageSize;


        // ======================================
        // Fetch Users
        // ======================================

        const users =
            await userRepo.findAllUsers(
                query,
                skip,
                pageSize
            );


        // ======================================
        // Total Records
        // ======================================

        const totalRecords =
            await userRepo.countDocuments(
                query
            );


        // ======================================
        // Active / Inactive User Counts
        // ======================================

        let totalActive;
        let totalInActive;


        if (
            organizationId !== undefined &&
            organizationId !== null &&
            organizationId !== ""
        ) {

            totalActive =
                await userRepo.countDocuments({
                    ...query,
                    status: 1
                });


            totalInActive =
                await userRepo.countDocuments({
                    ...query,
                    status: 2
                });

        } else {

            totalActive =
                await userRepo.countDocuments({
                    status: 1
                });


            totalInActive =
                await userRepo.countDocuments({
                    status: 2
                });

        }


        // ======================================
        // No Records
        // ======================================

        if (
            !users ||
            users.length === 0
        ) {

            logger.warn(
                "getAllUsers records not found",
                {
                    query,
                    organizationId,
                    memberStatus
                }
            );

            return buildResponse(
                DataConstant.NOT_FOUND,
                DataConstant.RECORDS_NOT_FOUND,
                null
            );
        }


        // ======================================
        // Build User Responses
        // ======================================

        const userResponses =
            await Promise.all(

                users.map(async user => {

                    const response =
                        await buildAppUserResponse(
                            user
                        );


                    // ==================================
                    // Add Membership Information
                    // ==================================

                    if (
                        organizationId !== undefined &&
                        organizationId !== null &&
                        organizationId !== ""
                    ) {

                        const membership =
                            membershipMap.get(
                                user._id.toString()
                            );


                        if (membership) {

                            response.membershipStatus =
                                membership.status;

                            response.membershipId =
                                membership._id;

                            response.membershipJoinedAt =
                                membership.joinedAt;

                            response.membershipActionBy =
                                membership.actionBy;

                            response.membershipActionAt =
                                membership.actionAt;

                            response.membershipActionRemark =
                                membership.actionRemark;

                        } else {

                            response.membershipStatus =
                                null;

                        }

                    }


                    return response;

                })

            );


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
                    userResponses,

                pageIndex,

                pageSize,

                totalRecords,

                totalActive,

                totalInActive,

                totalPages,

                isLast:
                    pageIndex + 1 >= totalPages,

                hasNext:
                    pageIndex + 1 < totalPages,

                hasPrevious:
                    pageIndex > 0

            }
        );

    } catch (error) {

        logger.error(
            "getAllUsers service error",
            {
                error:
                    error.message,

                stack:
                    error.stack
            }
        );

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE,
            null
        );
    }
}


async function joinOrganization(joinRequest) {
  logger.info("joinOrganization service called", {
    id: joinRequest?.id,
    userId: joinRequest?.userId,
    organizationId: joinRequest?.organizationId,
    uniqueCode: joinRequest?.uniqueCode,
    hasQrCode: !!joinRequest?.qrCode
  });

  try {

    // ======================================
    // Validate Request
    // ======================================

    const userId =
      joinRequest?.id ||
      joinRequest?.userId;

    if (
      !userId ||
      (
        !joinRequest?.organizationId &&
        !joinRequest?.uniqueCode &&
        !joinRequest?.qrCode
      )
    ) {

      logger.warn(
        "joinOrganization validation failed",
        {
          userId,
          organizationId:
            joinRequest?.organizationId,
          uniqueCode:
            joinRequest?.uniqueCode,
          hasQrCode:
            !!joinRequest?.qrCode
        }
      );

      return buildResponse(
        DataConstant.BAD_REQUEST,
        DataConstant.INVALID_REQUEST
      );
    }


    // ======================================
    // Determine Membership Status
    // ======================================
    //
    // uniqueCode => Auto Approved
    // organizationId / qrCode => Pending
    //
    // 1 = Pending
    // 2 = Approved
    // ======================================

    const isAutoApprove =
      !!joinRequest?.uniqueCode;

    const membershipStatus =
      isAutoApprove ? 2 : 1;


    // ======================================
    // Find User
    // ======================================

    const user =
      await userRepo.findById(userId);

    if (!user) {

      logger.warn(
        "joinOrganization failed: user not found",
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
    // Find Organization
    // ======================================

    const organization =
      await findOrganizationForJoin(
        joinRequest
      );

    if (
      !organization ||
      organization.status !== 1
    ) {

      logger.warn(
        "joinOrganization failed: organization not found/inactive",
        {
          organizationId:
            joinRequest?.organizationId,

          uniqueCode:
            joinRequest?.uniqueCode,

          hasQrCode:
            !!joinRequest?.qrCode
        }
      );

      return buildResponse(
        DataConstant.NOT_FOUND,
        DataConstant.ORGANIZATION_NOT_FOUND
      );
    }


    // ======================================
    // Check Existing Membership
    // ======================================

    let membership =
      await OrganizationMember.findOne({
        organizationId:
          organization._id,

        userId:
          user._id
      });


    // ======================================
    // Existing Membership
    // ======================================

    if (membership) {

      // ======================================
      // Pending
      // ======================================

      if (membership.status === 1) {

        logger.info(
          "User already has a pending organization request",
          {
            userId: user._id,
            organizationId:
              organization._id,
            membershipId:
              membership._id
          }
        );

        return buildResponse(
          DataConstant.CONFLICT,
          "Your request to join this organization is already pending."
        );
      }


      // ======================================
      // Approved
      // ======================================

      if (membership.status === 2) {

        logger.info(
          "User already approved in organization",
          {
            userId: user._id,
            organizationId:
              organization._id,
            membershipId:
              membership._id
          }
        );

        return buildResponse(
          DataConstant.CONFLICT,
          "User is already a member of this organization."
        );
      }


      // ======================================
      // Rejected / Removed
      // ======================================
      //
      // 3 = Removed by organization
      // 4 = Rejected by organization
      //
      // Allow user to submit a new request.
      //
      // If uniqueCode is provided:
      //      status = 2 (Approved)
      //
      // Otherwise:
      //      status = 1 (Pending)
      // ======================================

      if (
        membership.status === 3 ||
        membership.status === 4
      ) {

        membership.status =
          membershipStatus;

        membership.actionBy =
          null;

        membership.actionAt =
          null;

        membership.actionRemark =
          isAutoApprove
            ? "Automatically approved using organization unique code"
            : null;

        membership.joinedAt =
          new Date();

        membership.updatedAt =
          new Date();

        membership =
          await membership.save();

        logger.info(
          "Existing organization membership request renewed",
          {
            userId:
              user._id,

            organizationId:
              organization._id,

            membershipId:
              membership._id,

            status:
              membership.status
          }
        );

      }


      // ======================================
      // User Previously Left
      // ======================================
      //
      // 0 = Left by user
      //
      // Allow user to join again.
      //
      // If uniqueCode is provided:
      //      status = 2
      //
      // Otherwise:
      //      status = 1
      // ======================================

      else if (
        membership.status === 0
      ) {

        membership.status =
          membershipStatus;

        membership.actionBy =
          null;

        membership.actionAt =
          null;

        membership.actionRemark =
          isAutoApprove
            ? "Automatically approved using organization unique code"
            : null;

        membership.joinedAt =
          new Date();

        membership.updatedAt =
          new Date();

        membership =
          await membership.save();

        logger.info(
          "User rejoined organization after leaving",
          {
            userId:
              user._id,

            organizationId:
              organization._id,

            membershipId:
              membership._id,

            status:
              membership.status
          }
        );
      }

    } else {

      // ======================================
      // Create New Membership
      // ======================================

      membership =
        new OrganizationMember({

          organizationId:
            organization._id,

          userId:
            user._id,

          // 1 = Pending
          // 2 = Approved
          status:
            membershipStatus,

          actionBy:
            null,

          actionAt:
            null,

          actionRemark:
            isAutoApprove
              ? "Automatically approved using organization unique code"
              : null,

          joinedAt:
            new Date(),

          createdAt:
            new Date(),

          updatedAt:
            new Date()
        });

      membership =
        await membership.save();

      logger.info(
        "Organization membership request created",
        {
          membershipId:
            membership._id,

          userId:
            user._id,

          organizationId:
            organization._id,

          status:
            membership.status,

          autoApproved:
            isAutoApprove
        }
      );
    }


    // ======================================
    // Update User
    // ======================================
    //
    // User can belong to multiple
    // organizations, therefore we do NOT
    // store organizationId in users.
    // ======================================

    user.joinOrganization = true;

    user.updatedAt =
      new Date();

    const updatedUser =
      await userRepo.save(user);


    // ======================================
    // Build User Response
    // ======================================

    const userResponse =
      await buildAppUserResponse(
        updatedUser
      );


    // ======================================
    // Response
    // ======================================

    return buildResponse(
      DataConstant.OK,

      isAutoApprove
        ? "Organization joined successfully"
        : "Organization join request submitted successfully",

      {
        organization: {

          id:
            organization._id,

          name:
            organization.name,

          uniqueCode:
            organization.uniqueCode,

          status:
            organization.status
        },

        membership: {

          id:
            membership._id,

          organizationId:
            membership.organizationId,

          userId:
            membership.userId,

          // 1 = Pending
          // 2 = Approved
          status:
            membership.status,

          joinedAt:
            membership.joinedAt,

          actionBy:
            membership.actionBy,

          actionAt:
            membership.actionAt,

          actionRemark:
            membership.actionRemark
        },

        userResponse
      }
    );

  } catch (error) {

    logger.error(
      "joinOrganization service error",
      {
        userId:
          joinRequest?.id ||
          joinRequest?.userId,

        organizationId:
          joinRequest?.organizationId,

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


async function findOrganizationForJoin(joinRequest) {
  if (joinRequest.organizationId) {
    return Organization.findById(joinRequest.organizationId);
  }

  if (joinRequest.uniqueCode) {
    return Organization.findOne({ uniqueCode: joinRequest.uniqueCode });
  }

  const qrLookup = parseQrCodeLookup(joinRequest.qrCode);
  if (qrLookup.id) {
    return Organization.findById(qrLookup.id);
  }

  if (qrLookup.uniqueCode) {
    return Organization.findOne({ uniqueCode: qrLookup.uniqueCode });
  }

  return Organization.findOne({ qrCode: joinRequest.qrCode });
}

function parseQrCodeLookup(qrCode) {
  try {
    const parsedQrCode = JSON.parse(qrCode);
    return {
      id: parsedQrCode.id,
      uniqueCode: parsedQrCode.uniqueCode
    };
  } catch (error) {
    return {};
  }
}


async function joinOrganizations(userId, organizationIds) {

  logger.info("joinOrganizations service called", {
    userId,
    organizationIds
  });

  try {

    // ======================================
    // Validate User
    // ======================================

    if (!userId) {

      return buildResponse(
        DataConstant.BAD_REQUEST,
        "userId is required",
        null
      );

    }

    if (
      !Array.isArray(organizationIds) ||
      organizationIds.length === 0
    ) {

      return buildResponse(
        DataConstant.BAD_REQUEST,
        "At least one organizationId is required",
        null
      );

    }

    // ======================================
    // Remove Duplicate Organization IDs
    // ======================================

    const uniqueOrganizationIds = [
      ...new Set(
        organizationIds
          .filter(id => id)
          .map(id => id.toString().trim())
      )
    ];

    if (uniqueOrganizationIds.length === 0) {

      return buildResponse(
        DataConstant.BAD_REQUEST,
        "Invalid organizationIds",
        null
      );

    }

    // ======================================
    // Validate User
    // ======================================

    const user = await User.findById(userId);

    if (!user) {

      logger.warn(
        "User not found",
        {
          userId
        }
      );

      return buildResponse(
        DataConstant.NOT_FOUND,
        DataConstant.USER_NOT_FOUND,
        null
      );

    }

    // ======================================
    // Validate Organization IDs
    // ======================================

    const invalidOrganizationIds =
      uniqueOrganizationIds.filter(
        id => !mongoose.Types.ObjectId.isValid(id)
      );

    if (invalidOrganizationIds.length > 0) {

      return buildResponse(
        DataConstant.BAD_REQUEST,
        "One or more organizationIds are invalid",
        {
          invalidOrganizationIds
        }
      );

    }

    // ======================================
    // Find Active Organizations
    // ======================================

    const organizations =
      await Organization.find({
        _id: {
          $in: uniqueOrganizationIds
        },
        status: 1
      }).lean();

    const foundOrganizationIds =
      organizations.map(
        organization =>
          organization._id.toString()
      );

    // ======================================
    // Organizations Not Found / Inactive
    // ======================================

    const notFoundOrganizationIds =
      uniqueOrganizationIds.filter(
        id =>
          !foundOrganizationIds.includes(id)
      );

    // ======================================
    // Find Existing Memberships
    // ======================================

    const existingMembers =
      await OrganizationMember.find({
        userId,
        organizationId: {
          $in: foundOrganizationIds
        }
      });

    // ======================================
    // Result Collections
    // ======================================

    const pendingOrganizationIds = [];

    const approvedOrganizationIds = [];

    const rejoinedOrganizationIds = [];

    const createdMembers = [];

    // ======================================
    // Process Organizations
    // ======================================

    for (
      const organizationId of foundOrganizationIds
    ) {

      const membership =
        existingMembers.find(
          member =>
            member.organizationId.toString() ===
            organizationId
        );

      // ======================================
      // New Membership
      // ======================================

      if (!membership) {

        const newMembership =
          new OrganizationMember({

            organizationId,

            userId,

            // 1 = Pending
            status: 1,

            joinedAt: new Date(),

            createdAt: new Date(),

            updatedAt: new Date()

          });

        const savedMembership =
          await newMembership.save();

        createdMembers.push(
          savedMembership
        );

        pendingOrganizationIds.push(
          organizationId
        );

        continue;
      }

      // ======================================
      // Existing Membership
      // ======================================

      switch (membership.status) {

        // ==================================
        // LEFT
        // 0 = Left
        // ==================================

        case 0:

          membership.status = 1;
          membership.joinedAt = new Date();
          membership.updatedAt = new Date();

          await membership.save();

          rejoinedOrganizationIds.push(
            organizationId
          );

          pendingOrganizationIds.push(
            organizationId
          );

          logger.info(
            "User requested to rejoin organization",
            {
              userId,
              organizationId,
              membershipId: membership._id
            }
          );

          break;


        // ==================================
        // PENDING
        // 1 = Pending
        // ==================================

        case 1:

          pendingOrganizationIds.push(
            organizationId
          );

          logger.info(
            "Organization join request already pending",
            {
              userId,
              organizationId,
              membershipId: membership._id
            }
          );

          break;


        // ==================================
        // APPROVED
        // 2 = Approved
        // ==================================

        case 2:

          approvedOrganizationIds.push(
            organizationId
          );

          logger.info(
            "User already approved in organization",
            {
              userId,
              organizationId,
              membershipId: membership._id
            }
          );

          break;


        // ==================================
        // REMOVED
        // 3 = Removed
        // ==================================

        case 3:

          // Removed user is allowed
          // to request joining again.

          membership.status = 1;
          membership.joinedAt = new Date();
          membership.updatedAt = new Date();

          await membership.save();

          rejoinedOrganizationIds.push(
            organizationId
          );

          pendingOrganizationIds.push(
            organizationId
          );

          logger.info(
            "Removed user requested to join organization again",
            {
              userId,
              organizationId,
              membershipId: membership._id
            }
          );

          break;


        // ==================================
        // Unknown Status
        // ==================================

        default:

          logger.warn(
            "Unknown organization membership status",
            {
              userId,
              organizationId,
              membershipId: membership._id,
              status: membership.status
            }
          );

          break;
      }
    }

    // ======================================
    // Update User
    // ======================================

    /*
     * Do NOT set:
     *
     * user.organizationId = organizationId
     *
     * because a user can belong to multiple
     * organizations.
     */

    user.joinOrganization = true;
    user.updatedAt = new Date();

    await user.save();

    // ======================================
    // Logging
    // ======================================

    logger.info(
      "Organizations processed successfully",
      {
        userId,

        requested:
          uniqueOrganizationIds.length,

        pending:
          pendingOrganizationIds.length,

        approved:
          approvedOrganizationIds.length,

        rejoined:
          rejoinedOrganizationIds.length,

        notFound:
          notFoundOrganizationIds.length
      }
    );

    // ======================================
    // Response
    // ======================================

    return buildResponse(
      DataConstant.OK,
      "Organizations processed successfully",
      {

        userId,

        requestedOrganizationIds:
          uniqueOrganizationIds,

        pendingOrganizationIds,

        approvedOrganizationIds,

        rejoinedOrganizationIds,

        notFoundOrganizationIds,

        totalRequested:
          uniqueOrganizationIds.length,

        totalPending:
          pendingOrganizationIds.length,

        totalApproved:
          approvedOrganizationIds.length,

        totalRejoined:
          rejoinedOrganizationIds.length,

        totalNotFound:
          notFoundOrganizationIds.length
      }
    );

  } catch (error) {

    logger.error(
      "joinOrganizations service error",
      {
        userId,
        organizationIds,
        error: error.message,
        stack: error.stack
      }
    );

    return buildResponse(
      DataConstant.SERVER_ERROR,
      DataConstant.SERVER_MESSAGE,
      null
    );
  }
}

function generateOtp() {
  return cryptoRandomNumber(100000, 999999).toString();
}

function cryptoRandomNumber(min, max) {
  const crypto = require("crypto");
  return crypto.randomInt(min, max + 1);
}

async function logout(userId) {

    logger.info("Logout service called", {
        userId
    });

    try {

        if (!userId) {

            logger.warn("Logout failed: User ID is missing");

            return buildResponse(
                400,
                "User ID is required.",
                null
            );
        }

        logger.info("Fetching user", {
            userId
        });

        const user = await userRepo.findById(userId);

        if (!user) {

            logger.warn("Logout failed: User not found", {
                userId
            });

            return buildResponse(
                404,
                "User not found.",
                null
            );
        }

        logger.info("User found. Clearing device token", {
            userId
        });

        user.deviceToken = null;
        user.deviceType = null;
        user.updatedAt = new Date();

        await user.save();

        logger.info("Logout completed successfully", {
            userId
        });

        return buildResponse(
            200,
            "Logout successful",
            null
        );

    } catch (err) {

        logger.error("Logout failed due to server error", {
            userId,
            error: err.message,
            stack: err.stack
        });

        return buildResponse(
            500,
            "Logout failed",
            null
        );
    }
}

async function updateNotificationSettings(
    userId,
    notificationRequest
) {

    logger.info(
        "updateNotificationSettings service called",
        {
            userId,
            notificationRequest
        }
    );

    try {

        if (!userId) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "User ID is required."
            );
        }

        if (!notificationRequest) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "Notification settings are required."
            );
        }

        // ======================================
        // Validate at least one setting
        // ======================================

        const hasSetting =
            typeof notificationRequest.notificationEnable === "boolean" ||
            typeof notificationRequest.alertNotification === "boolean" ||
            typeof notificationRequest.announcementNotification === "boolean" ||
            typeof notificationRequest.eventNotification === "boolean";

        if (!hasSetting) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "At least one notification setting is required."
            );
        }

        // ======================================
        // Find User
        // ======================================

        const user = await userRepo.findById(userId);

        if (!user) {

            logger.warn(
                "User not found while updating notification settings",
                {
                    userId
                }
            );

            return buildResponse(
                DataConstant.NOT_FOUND,
                "User not found."
            );
        }

        // ======================================
        // Build Safe Updates
        // ======================================

        const updates = {};

        if (
            typeof notificationRequest.notificationEnable ===
            "boolean"
        ) {

            updates.notificationEnable =
                notificationRequest.notificationEnable;
        }

        if (
            typeof notificationRequest.alertNotification ===
            "boolean"
        ) {

            updates.alertNotification =
                notificationRequest.alertNotification;
        }

        if (
            typeof notificationRequest.announcementNotification ===
            "boolean"
        ) {

            updates.announcementNotification =
                notificationRequest.announcementNotification;
        }

        if (
            typeof notificationRequest.eventNotification ===
            "boolean"
        ) {

            updates.eventNotification =
                notificationRequest.eventNotification;
        }

        updates.updatedAt = new Date();

        // ======================================
        // Update User
        // ======================================

        const updatedUser =
            await userRepo.updateNotificationSettings(
                userId,
                updates
            );

        logger.info(
            "Notification settings updated successfully",
            {
                userId
            }
        );

        return buildResponse(
            DataConstant.OK,
            "Notification settings updated successfully.",
            await buildAppUserResponse(updatedUser)
        );

    } catch (error) {

        logger.error(
            "updateNotificationSettings service error",
            {
                userId,
                error: error.message,
                stack: error.stack
            }
        );

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE
        );
    }
}


async function leftOrganization(userId, organizationId) {

    logger.info("leftOrganization service called", {
        userId,
        organizationId
    });

    try {

        // ======================================
        // Validate Request
        // ======================================

        if (!userId || !organizationId) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "userId and organizationId are required",
                null
            );

        }

        // ======================================
        // Validate ObjectIds
        // ======================================

        if (
            !mongoose.Types.ObjectId.isValid(userId) ||
            !mongoose.Types.ObjectId.isValid(organizationId)
        ) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "Invalid userId or organizationId",
                null
            );

        }

        // ======================================
        // Validate User
        // ======================================

        const user =
            await User.findById(userId);

        if (!user) {

            logger.warn(
                "leftOrganization user not found",
                {
                    userId
                }
            );

            return buildResponse(
                DataConstant.NOT_FOUND,
                DataConstant.USER_NOT_FOUND,
                null
            );

        }

        // ======================================
        // Validate Organization
        // ======================================

        const organization =
            await Organization.findById(
                organizationId
            );

        if (!organization) {

            logger.warn(
                "leftOrganization organization not found",
                {
                    organizationId
                }
            );

            return buildResponse(
                DataConstant.NOT_FOUND,
                DataConstant.ORGANIZATION_NOT_FOUND,
                null
            );

        }

        // ======================================
        // Find Membership
        // ======================================

        const membership =
            await OrganizationMember.findOne({
                userId,
                organizationId
            });

        if (!membership) {

            logger.warn(
                "Organization membership not found",
                {
                    userId,
                    organizationId
                }
            );

            return buildResponse(
                DataConstant.NOT_FOUND,
                "User is not a member of this organization",
                null
            );

        }

        // ======================================
        // Current Membership Status
        // ======================================

        /*
         * 0 = Left by user
         * 1 = Pending
         * 2 = Approved
         * 3 = Removed by organization
         * 4 = Rejected
         */

        // Already left
        if (membership.status === 0) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "User has already left this organization",
                null
            );

        }

        // Organization removed the user
        if (membership.status === 3) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "You have been removed from this organization",
                null
            );

        }

        // Organization rejected the request
        if (membership.status === 4) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "Your request to join this organization was rejected",
                null
            );

        }

        // ======================================
        // Only Pending / Approved Can Leave
        // ======================================

        if (
            membership.status !== 1 &&
            membership.status !== 2
        ) {

            return buildResponse(
                DataConstant.BAD_REQUEST,
                "You cannot leave this organization in the current membership status",
                null
            );

        }

        // ======================================
        // Update Membership
        // ======================================

        membership.status = 0;

        /*
         * This action is performed by the
         * mobile user, not organization user.
         *
         * Therefore clear organization-admin
         * action information.
         */

        membership.actionBy = null;
        membership.actionAt = null;
        membership.actionRemark = null;

        membership.updatedAt = new Date();

        const updatedMembership =
            await membership.save();

        logger.info(
            "User left organization successfully",
            {
                userId,
                organizationId,
                membershipId:
                    updatedMembership._id
            }
        );

        // ======================================
        // Check Remaining Active Memberships
        // ======================================

        /*
         * Pending + Approved memberships
         * are considered existing memberships
         * for joinOrganization.
         *
         * If you want only approved organizations
         * to count here, use status: 2.
         */

        const activeMembershipCount =
            await OrganizationMember.countDocuments({
                userId,
                status: {
                    $in: [1, 2]
                }
            });

        // ======================================
        // Update User Join Status
        // ======================================

        const joinOrganization =
            activeMembershipCount > 0;

        if (
            user.joinOrganization !==
            joinOrganization
        ) {

            user.joinOrganization =
                joinOrganization;

            user.updatedAt = new Date();

            await user.save();

        }

        // ======================================
        // Response
        // ======================================

        return buildResponse(
            DataConstant.OK,
            "Organization left successfully",
            {
                userId,

                organizationId,

                membershipId:
                    updatedMembership._id,

                status:
                    updatedMembership.status,

                remainingOrganizations:
                    activeMembershipCount,

                joinOrganization
            }
        );

    } catch (error) {

        logger.error(
            "leftOrganization service error",
            {
                userId,
                organizationId,
                error: error.message,
                stack: error.stack
            }
        );

        return buildResponse(
            DataConstant.SERVER_ERROR,
            DataConstant.SERVER_MESSAGE,
            null
        );
    }
}

module.exports = {
  login,
  logout,
  forgotPassword,
  verifyForgotOtp,
  resetPassword,
  registerUser,
  verifyEmailOtp,
  updateProfile,
  getProfile,
  getAllUsers,
  joinOrganization,
  updateNotificationSettings,
  joinOrganizations,
  leftOrganization
};
