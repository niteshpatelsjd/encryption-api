const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Device = require("../models/Device");

module.exports = async function deviceListAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      responseCode: 401,
      message: "Missing access token",
      responseBody: null
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET
    );

    if (payload.purpose === "ACCESS") {
      const [user, device] = await Promise.all([
        User.findOne({ _id: payload.userId, status: 1 }).select("_id").lean(),
        Device.findOne({
          userId: payload.userId,
          deviceId: payload.deviceId,
          status: "ACTIVE"
        }).select("_id").lean()
      ]);

      if (!user || !device) throw new Error("Inactive user or device");
      req.user = payload;
      return next();
    }
  } catch (_mobileError) {
    // The token may be an Admin token signed with JWT_SECRET.
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose === "ACCESS") throw new Error("Invalid admin token");
    req.admin = payload;
    return next();
  } catch (_adminError) {
    return res.status(401).json({
      responseCode: 401,
      message: "Invalid or expired token",
      responseBody: null
    });
  }
};
