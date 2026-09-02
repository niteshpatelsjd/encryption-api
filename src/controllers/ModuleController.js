const moduleService = require("../services/ModuleService");
const logger = require("../utils/logger"); // ✅ Import logger

// 🔹 Add or Update Module
exports.addModule = async (req, res) => {
  const moduleRequest = req.body;
  logger.info("🎯 addModule request received", { body: moduleRequest });

  try {
    const result = await moduleService.addModule(moduleRequest);
    logger.info("✅ addModule response", { result });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("❌ addModule error", { error: error.message });
    res.status(500).json({ responseCode: 500, message: "Internal Server Error" });
  }
};

// 🔹 Get All Modules (with optional pagination & search)
exports.getAllModule = async (req, res) => {
  const { pageIndex, pageSize, searchText } = req.query;

  const page = pageIndex !== undefined ? parseInt(pageIndex) : undefined;
  const size = pageSize !== undefined ? parseInt(pageSize) : undefined;

  logger.info("🎯 getAllModule request received", {
    pageIndex: page,
    pageSize: size,
    searchText,
  });

  try {
    const result = await moduleService.getAllModule(page, size, searchText);
    logger.info("✅ getAllModule response", { count: result.data?.length || 0 });
    res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("❌ getAllModule error", { error: error.message });
    res.status(500).json({ responseCode: 500, message: "Internal Server Error" });
  }
};
