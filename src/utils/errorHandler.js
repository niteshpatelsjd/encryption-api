const AppError = require("./AppError");
const logger = require("./logger");

function notFound(request, _response, next) {
  next(new AppError(`Route not found: ${request.method} ${request.originalUrl}`, 404));
}

function errorHandler(error, _request, response, _next) {
  const statusCode = error.statusCode || 500;
  logger.error(error.message, { stack: error.stack });

  return response.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal server error" : error.message
  });
}

module.exports = { notFound, errorHandler };
