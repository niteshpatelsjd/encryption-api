const jwt = require("jsonwebtoken");
const AdminUser = require("../models/AdminUser");
module.exports = async function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const payload = jwt.verify(header.startsWith("Bearer ") ? header.slice(7) : "", process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.purpose !== "ADMIN_ACCESS" || !payload.adminUserId) throw new Error("Invalid admin purpose");
    const admin = await AdminUser.findById(payload.adminUserId).select("status").lean();
    if (!admin || admin.status !== 1) throw new Error("Inactive admin");
    req.admin = { ...payload, userId: String(admin._id) };
    return next();
  } catch (_error) {
    return res.status(401).json({ responseCode: 401, message: "Admin sign-in required", responseBody: { code: "INVALID_ADMIN_TOKEN" } });
  }
};
