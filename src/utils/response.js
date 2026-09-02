// utils/response.js
function buildResponse(responseCode, message, responseBody = null) {
  return {
    responseCode,
    message,
    responseBody,
  };
}

module.exports = buildResponse;
