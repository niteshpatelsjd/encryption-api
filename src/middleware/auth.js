const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Device = require("../models/Device");

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ responseCode: 401, message: "Missing access token", responseBody: null });
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET);
    if (payload.purpose !== "ACCESS") throw new Error("Invalid purpose");
    const [user, device] = await Promise.all([
      User.findOne({ _id: payload.userId, status: 1 }).select("_id").lean(),
      Device.findOne({ userId: payload.userId, deviceId: payload.deviceId, status: "ACTIVE" }).select("_id").lean()
    ]);
    if (!user || !device) throw new Error("User or device is inactive");
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ responseCode: 401, message: "Invalid or expired access token", responseBody: null });
  }
};
