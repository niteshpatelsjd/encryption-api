// services/ModuleService.js
const moduleRepo = require("../repositories/ModuleRepository");
const Module = require("../models/Module");
const logger = require("../utils/logger");
const { buildModuleResponse } = require("../utils/ResponseBuilder");

// ✅ Add / Update Module
async function addModule(moduleRequest) {
  logger.info("addModule called", { moduleRequest });

  try {
    if (moduleRequest.id) {
      logger.info(`Updating module with id=${moduleRequest.id}`);

      const module = await moduleRepo.findById(moduleRequest.id);
      if (!module) {
        logger.warn(`⚠️ Module not found for id=${moduleRequest.id}`);
        return { responseCode: 404, message: "Record not found", responseBody: null };
      }

      module.moduleName = moduleRequest.moduleName;
      module.moduleCode = moduleRequest.moduleCode;
      module.parentModuleName = moduleRequest.parentModuleName;
      module.updatedAt = new Date();

      const updated = await moduleRepo.save(module);
      logger.info(`✅ Module updated successfully`, { id: updated._id });

      return {
        responseCode: 200,
        message: "Module updated",
        responseBody: buildModuleResponse(updated)
      };
    } else {
      logger.info("Creating new module", {
        moduleName: moduleRequest.moduleName,
        moduleCode: moduleRequest.moduleCode
      });

      const module = new Module({
        moduleName: moduleRequest.moduleName,
        moduleCode: moduleRequest.moduleCode,
        parentModuleName: moduleRequest.parentModuleName,
        moduleAction: 0,
        addAction: 0,
        updateAction: 0,
        deleteAction: 0,
        viewAction: 0,
        downloadAction: 0,
        status: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const saved = await moduleRepo.save(module);
      logger.info(`✅ Module created successfully`, { id: saved._id });

      return {
        responseCode: 200,
        message: "Module created",
        responseBody: buildModuleResponse(saved)
      };
    }
  } catch (error) {
    logger.error("❌ Error in addModule", { error });
    return { responseCode: 500, message: "Server error", responseBody: null };
  }
}

// ✅ Get all modules
async function getAllModule(pageIndex, pageSize, searchText) {
  logger.info("getAllModule called", { pageIndex, pageSize, searchText });

  try {
    if (pageIndex !== undefined && pageSize !== undefined) {
      logger.info(`Fetching modules with pagination pageIndex=${pageIndex}, pageSize=${pageSize}`);

      let result;
      if (searchText && searchText.trim() !== "") {
        logger.info(`Searching modules with text="${searchText}"`);
        result = await moduleRepo.findBySearchTextWithPagination(searchText, pageIndex, pageSize);
      } else {
        logger.info(`Fetching all modules without search`);
        const skip = pageIndex * pageSize;
        const data = await Module.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize);
        const total = await Module.countDocuments();
        result = { data, total };
      }

      if (result.data.length > 0) {
        logger.info(`✅ Found ${result.data.length} modules`);
        return {
          responseCode: 200,
          message: "Record found",
          responseBody: {
            content: result.data.map(buildModuleResponse),
            pageIndex,
            pageSize,
            totalElements: result.total,
            totalPages: Math.ceil(result.total / pageSize),
            isLast: pageIndex + 1 >= Math.ceil(result.total / pageSize),
            hasNext: pageIndex + 1 < Math.ceil(result.total / pageSize),
            hasPrevious: pageIndex > 0
          }
        };
      } else {
        logger.warn("⚠️ No modules found in pagination result");
        return { responseCode: 404, message: "Record not found", responseBody: null };
      }
    } else {
      logger.info("Fetching all modules without pagination");

      let moduleList;
      if (searchText && searchText.trim() !== "") {
        logger.info(`Searching modules with text="${searchText}"`);
        moduleList = await moduleRepo.findBySearchText(searchText);
      } else {
        moduleList = await moduleRepo.findAll();
      }

      if (moduleList && moduleList.length > 0) {
        logger.info(`✅ Found ${moduleList.length} modules`);
        return {
          responseCode: 200,
          message: "Record found",
          responseBody: moduleList.map(buildModuleResponse)
        };
      } else {
        logger.warn("⚠️ No modules found");
        return { responseCode: 404, message: "Record not found", responseBody: null };
      }
    }
  } catch (error) {
    logger.error("❌ Error in getAllModule", { error });
    return { responseCode: 500, message: "Server error", responseBody: null };
  }
}

module.exports = {
  addModule,
  getAllModule
};
