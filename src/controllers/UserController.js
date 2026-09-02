const userService = require("../services/UserService");
const mobileOtpService = require("../services/MobileOtpService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

exports.requestOtp = async (req, res) => {
  try {
    const result = await mobileOtpService.requestOtp(req.body);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("requestOtp controller error", {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const result = await mobileOtpService.verifyOtp(req.body, { ip: req.ip });
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("verifyOtp controller error", {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
};


exports.login = async (req, res) => {
    try {

        logger.info("login request received", {
            email: req.body?.email,
            deviceType: req.body?.deviceType
        });

        const result = await userService.login(req.body);

        logger.info("login response", {
            responseCode: result.responseCode
        });

        res.status(result.responseCode).json(result);

    } catch (error) {

        logger.error("login controller error", {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json(
            buildResponse(
                500,
                "Internal Server Error"
            )
        );
    }
};

exports.forgotPassword = async (req, res) => {
    try {

        logger.info("forgotPassword request received", {
            email: req.body?.email
        });

        const result = await userService.forgotPassword(req.body);

        logger.info("forgotPassword response", {
            responseCode: result.responseCode
        });

        res.status(200).json(result);

    } catch (error) {

        logger.error("forgotPassword controller error", {
            error: error.message,
            stack: error.stack
        });

        res.status(200).json(
            buildResponse(
                500,
                "Internal Server Error"
            )
        );
    }
};

exports.verifyForgotOtp = async (req, res) => {

    try {

        logger.info("verifyForgotOtp request received", {
            email: req.body?.email
        });

        const result = await userService.verifyForgotOtp(req.body);

        logger.info("verifyForgotOtp response", {
            responseCode: result.responseCode
        });

        res.status(result.responseCode).json(result);

    } catch (error) {

        logger.error("verifyForgotOtp controller error", {
            error: error.message,
            stack: error.stack
        });

        res.status(200).json(
            buildResponse(
                500,
                "Internal Server Error"
            )
        );
    }

};

exports.resetPassword = async (req, res) => {

    try {

        logger.info("resetPassword request received");

        const result = await userService.resetPassword(req.body);

        logger.info("resetPassword response", {
            responseCode: result.responseCode
        });

        res.status(result.responseCode).json(result);

    } catch (error) {

        logger.error("resetPassword controller error", {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json(
            buildResponse(
                500,
                "Internal Server Error"
            )
        );
    }

};
exports.register = async (req, res) => {
  try {
    logger.info("register request received", {
      name: req.body?.name,
      email: req.body?.email,
      countryCode: req.body?.countryCode,
      mobileNumber: req.body?.mobileNumber
    });

    const result = await userService.registerUser(req.body);
    logger.info("register response", { responseCode: result?.responseCode });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("register controller error", { error: error.message, stack: error.stack });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    const otp = req.query.otp || req.body.otp;

    logger.info("verifyEmailOtp request received", { hasToken: !!token });

    const result = await userService.verifyEmailOtp({ token, otp });
    logger.info("verifyEmailOtp response", { responseCode: result?.responseCode });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("verifyEmailOtp controller error", { error: error.message, stack: error.stack });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.createProfile = async (req, res) => {
  try {
    logger.info("createProfile request received", {
      id: req.body?.id,
      email: req.body?.email,
      hasImage: !!req.files?.imageProfile?.[0]
    });

    const result = await userService.updateProfile({
      ...req.body,
      imageProfile: req.files?.imageProfile?.[0] || null
    });

    logger.info("createProfile response", { responseCode: result?.responseCode });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("createProfile controller error", { error: error.message, stack: error.stack });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { id } = req.query;
    logger.info("getProfile request received", { id });

    const result = await userService.getProfile(id);
    logger.info("getProfile response", { responseCode: result?.responseCode });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("getProfile controller error", { error: error.message, stack: error.stack });
    res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};

exports.getAllUsers = async (req, res) => {
  try {

    let {
      pageIndex = 0,
      pageSize = 10,
      status,
      searchText,
      organizationId,
      memberStatus
    } = req.query;

    logger.info("getAllUsers request received", {
      query: req.query
    });

    // ======================================
    // Parse Pagination
    // ======================================

    pageIndex = parseInt(pageIndex, 10);
    pageSize = parseInt(pageSize, 10);

    // ======================================
    // Normalize Search Text
    // ======================================

    searchText =
      typeof searchText === "string"
        ? searchText.trim()
        : "";

    // ======================================
    // Normalize Organization ID
    // Optional
    // ======================================

    organizationId =
      typeof organizationId === "string"
        ? organizationId.trim()
        : organizationId;

    // ======================================
    // Normalize Member Status
    // Optional
    // ======================================

    memberStatus =
      typeof memberStatus === "string"
        ? memberStatus.trim()
        : memberStatus;

    // ======================================
    // Call Service
    // ======================================

    const result =
      await userService.getAllUsers({
        pageIndex,
        pageSize,
        status,
        searchText,
        organizationId,
        memberStatus
      });

    logger.info("getAllUsers response", {
      responseCode:
        result?.responseCode,

      totalRecords:
        result?.responseBody?.totalRecords,

      organizationId,

      memberStatus
    });

    return res
      .status(200)
      .json(result);

  } catch (error) {

    logger.error(
      "getAllUsers controller error",
      {
        error: error.message,
        stack: error.stack
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



exports.logout = async (req, res) => {
  const { userId } = req.query; // 👈 get id from query param
  console.log(`📥 Incoming request: logout with userId=${userId}`);

  try {
    const result = await userService.logout(userId);
    console.log(`✅ Logout success:`, result);

    res.status(200).json(result);
  } catch (error) {
    console.error(`❌ Logout failed for id=${userId}:`, error.message);

    res.status(200).json({
      responseCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};


exports.updateNotificationSettings = async (req, res)=> {

    try {

        const userId =
            req.body.userId ||
            req.user?.userId;

        const response =
            await userService.updateNotificationSettings(
                userId,
                req.body
            );

        return res
            .status(response.responseCode)
            .json(response);

    } catch (error) {

        logger.error(
            "updateNotificationSettings controller error",
            {
                error: error.message,
                stack: error.stack
            }
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};
