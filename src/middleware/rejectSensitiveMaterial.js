const { assertPublicMaterialOnly } = require("../utils/security");

module.exports = function rejectSensitiveMaterial(req, res, next) {
  try {
    assertPublicMaterialOnly(req.body);
    return next();
  } catch (error) {
    return res.status(400).json({ responseCode: 400, message: error.message, responseBody: null });
  }
};
