const provisioningService = require("../services/ProvisioningService");
const activationService = require("../services/ActivationService");
const authService = require("../services/AuthService");
const deviceService = require("../services/DeviceService");
const prekeyService = require("../services/PrekeyService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");

const handle = handler => async (req, res) => {
  try {
    const result = await handler(req);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error("Mobile user device API error", {
      path: req.originalUrl,
      error: error.message,
      stack: error.stack
    });
    return res.status(statusCode).json(
      buildResponse(
        statusCode,
        error.statusCode ? error.message : "Internal Server Error"
      )
    );
  }
};

module.exports = {
  createMobileUser: handle(req => provisioningService.createMobileUser(req.body)),
  generateSerial: handle(req => provisioningService.generateSerial(req.params.userId, req.admin?.userId)),
  updateMobileUserStatus: handle(req => provisioningService.updateMobileUserStatus(
    req.body,
    { adminUserId: req.admin?.userId }
  )),
  activate: handle(req => activationService.activate(req.body, { ip: req.ip })),
  refresh: handle(req => authService.refresh(req.body)),
  logout: handle(req => authService.logout(req.body)),
  registerDevice: handle(req => deviceService.register(req.body, { ip: req.ip })),
  listDevices: handle(req => deviceService.list({
    requestedUserId: req.query.userId,
    authenticatedUserId: req.user?.userId,
    isAdmin: Boolean(req.admin),
    pageIndex: req.query.pageIndex,
    pageSize: req.query.pageSize,
    status: req.query.status
  })),
  removeDevice: handle(req => {
    if (!req.admin && req.query.userId && String(req.query.userId) !== String(req.user?.userId)) {
      return buildResponse(403, "You can only revoke your own devices", { code: "DEVICE_OWNERSHIP_REQUIRED" });
    }
    const userId = req.admin ? req.query.userId : req.user?.userId;
    if (!userId) {
      const error = new Error("userId is required for admin device revocation");
      error.statusCode = 400;
      throw error;
    }
    return deviceService.remove(userId, req.params.deviceId, { adminUserId: req.admin?.userId, ip: req.ip });
  }),
  uploadPrekeys: handle(req => prekeyService.upload(req.user.userId, req.body)),
  getPrekeyBundle: handle(req => prekeyService.bundle(req.params.userId, {
    userId: req.user.userId,
    deviceId: req.user.deviceId
  })),
  replenishPrekeys: handle(req => prekeyService.replenish(req.user.userId, req.body))
};
