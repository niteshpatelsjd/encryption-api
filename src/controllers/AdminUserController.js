const adminUserService = require("../services/AdminUserService");
const buildResponse = require("../utils/response");
const s3Util = require("../utils/s3Util");
const logger = require("../utils/logger");


// 🔹 Update Profile
exports.addAdmin = async (req, res) => {
  try {
    const result = await adminUserService.addAdmin({
      ...req.body,
      imageFile: req.files?.imageFile?.[0] || null, // multer gives files as array
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ responseCode: 500, message: err.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const result = await adminUserService.loginAdmin({
      ...req.body
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({ responseCode: 500, message: err.message });
  }
};

exports.forgotPasswordOtp = async (req, res) => {
  try {

    const result =
      await adminUserService.forgotPasswordOtp({
        ...req.body
      });

    res.status(200).json(result);

  } catch (err) {

    res.status(200).json({
      responseCode: 500,
      message: err.message
    });
  }
};

exports.resetPasswordWithOtp = async (req, res) => {
  try {

    const result =
      await adminUserService.resetPasswordWithOtp({
        ...req.body
      });

    res.status(200).json(result);

  } catch (err) {

    res.status(200).json({
      responseCode: 500,
      message: err.message
    });
  }
};

exports.forgotPasswordLink = async (req, res) => {
  try {

    const result =
      await adminUserService.forgotPasswordLink({
        ...req.body
      });

    res.status(200).json(result);

  } catch (err) {

    res.status(200).json({
      responseCode: 500,
      message: err.message
    });
  }
};

exports.resetPasswordUsingLink = async (req, res) => {
  try {

    const result =
      await adminUserService.resetPasswordUsingLink({
        ...req.body
      });

    res.status(200).json(result);

  } catch (err) {

    res.status(200).json({
      responseCode: 500,
      message: err.message
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const result =
      await adminUserService.changePassword({
        ...req.body
      });

    res.status(200).json(result);
  } catch (err) {
    logger.error("changePassword controller error", {
      error: err.message,
      stack: err.stack,
    });

    res.status(200).json({
      responseCode: 500,
      message: err.message
    });
  }
};

// 🔹 Request OTP
exports.requestOtp = async (req, res) => {
  const { mobileNumber, countryCode } = req.body || {};

  if (!mobileNumber || !countryCode) {
    return res
      .status(400)
      .json(buildResponse(400, "mobileNumber and countryCode required", null));
  }

  // ✅ await is required here
  const userStatus = await adminUserService.findByCountryCodeAndMobileNumber(
    countryCode,
    mobileNumber
  );

  if (userStatus.responseCode !== 200) {
    return res
      .status(200)
      .json(buildResponse(404, "Given mobile number doesn't exist", null));
  }

  const result = await adminUserService.requestOtp(countryCode, mobileNumber);
  res.status(200).json(result);
};

// 🔹 Verify OTP
exports.verifyOtp = async (req, res) => {
  const { mobileNumber, countryCode, otp, deviceType, deviceToken } = req.body || {};
  if (!mobileNumber || !countryCode || !otp) {
    return res.status(400).json(buildResponse(400, "mobileNumber, countryCode and otp required", null));
  }
  const result = await adminUserService.verifyOtp(countryCode, mobileNumber, otp,deviceType, deviceToken);
  res.status(200).json(result);
};


exports.blockUnblockUser = async (req, res) => {
  try {
    const { id, status } = req.body;
    const updatedUser = await adminUserService.blockUnblockUser(id, status);
    res.status(200).json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Me
exports.getProfile = async (req, res) => {
  
  const { id } = req.params; // 👈 get id from path param
    
  const result = await adminUserService.getProfile(id);
  res.status(200).json(result);
  
};



exports.getAllUsers = async (req, res) => {
  try {
    let { pageIndex = 0, pageSize = 10, status, searchText  } = req.query;

    logger.info("📥 [getAllUsers] Incoming request", {
      query: req.query,
      body: req.body
    });

    pageIndex = parseInt(pageIndex, 10);
    pageSize = parseInt(pageSize, 10);
    searchText = typeof searchText === "string" ? searchText.trim() : "";

    logger.info("🔍 [getAllUsers] Parsed filters", {
      pageIndex,
      pageSize,
      status,
      searchText
    });

    const result = await adminUserService.getAllUsers({
      pageIndex,
      pageSize,
      status,
      searchText
    });

    logger.info("✅ [getAllUsers] Service response received", {
      responseCode: result?.responseCode,
      total: result?.responseBody?.totalCount
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error("❌ [getAllUsers] Controller error", { error: error.message, stack: error.stack });
    res.status(200).json(buildResponse(500, "Internal server error", null));
  }
};




/**
 * POST /uploadFile
 */
exports.uploadFile = async(req, res)=> {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json(buildResponse(400, "No file provided", null));
    }

    const uploaded = await s3Util.uploadFile(file, "admin-users/uploads");
    const result = {
      key: uploaded.key,
      url: await s3Util.getPreSignedUrl(uploaded.key)
    };

    return res.status(200).json(buildResponse(200, "File upload successful", result));
  } catch (err) {
    console.error("uploadFile error:", err);
    return res
      .status(500)
      .json(buildResponse(500, "Server error", null));
  }
};



exports.uploadMultipleFiles = async (req, res) => {
  try {
    const files = req.files; // Multer puts multiple files in req.files

    if (!files || files.length === 0) {
      return res
        .status(400)
        .json(buildResponse(400, "No files provided", null));
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

    return res
      .status(200)
      .json(buildResponse(200, "Files uploaded successfully", uploadedFiles));
  } catch (err) {
    console.error("uploadFiles error:", err);
    return res
      .status(500)
      .json(buildResponse(500, "Server error", null));
  }
};

exports.getTotalUserCount = async (req, res) => {
  const response = await adminUserService.getTotalUserCount();
  res.status(200).json(response);
};

exports.getAllUserSessions = async (req, res) => {
  try {
    // Safely extract from query or body depending on how you're sending them
    const {
      pageIndex = 0,
      pageSize = 10,
      searchText,
    } = req.query || req.body || {};

    // Parse numeric values safely
    const parsedPageIndex = Number.isInteger(parseInt(pageIndex)) ? parseInt(pageIndex, 10) : 0;
    const parsedPageSize = Number.isInteger(parseInt(pageSize)) ? parseInt(pageSize, 10) : 10;

    // Only trim searchText if it's a string
    const trimmedSearchText = typeof searchText === "string" ? searchText.trim() : "";

    // Pass parameters safely to service
    const result = await adminUserService.getAllUserSessions({
      pageIndex: parsedPageIndex,
      pageSize: parsedPageSize,
      searchText: trimmedSearchText,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error("getAllUserSessions controller error", { error });
    return res.status(200).json(buildResponse(500, "Internal server error", null));
  }
};

exports.logout = async (req, res) => {
  const { token } = req.query; // 👈 get id from query param
  console.log(`📥 Incoming request: logout with token=${token}`);

  try {
    const result = await adminUserService.logout(token);
    console.log(`✅ Logout success:`, result);

    res.status(200).json(result);
  } catch (error) {
    console.error(`❌ Logout failed for id=${token}:`, error.message);

    res.status(200).json({
      responseCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
