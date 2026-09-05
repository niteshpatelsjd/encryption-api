const jwt = require("jsonwebtoken");
const auth = require("./auth");
const adminAuth = require("./adminAuth");
module.exports = function deviceListAuth(req, res, next) {
  // This unverified hint selects a verifier only; it never grants authority.
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return jwt.decode(token)?.purpose === "ADMIN_ACCESS"
    ? adminAuth(req, res, next) : auth(req, res, next);
};
