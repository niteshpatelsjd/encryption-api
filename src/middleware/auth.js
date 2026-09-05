const access = require("../services/MobileAccessService");
module.exports = async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    req.user = await access.verifyAccess(header.startsWith("Bearer ") ? header.slice(7) : "");
    return next();
  } catch (error) {
    const result = access.response(error);
    return res.status(result.responseCode).json(result);
  }
};
