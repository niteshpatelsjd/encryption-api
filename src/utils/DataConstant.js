// utils/dataConstant.js

module.exports = {
  APP_NAME: "Nooq App",
  APP_LOGO_URL: "http://50.19.82.152/twik/files/twik-logo.png",

  RESPONSE_CODE: "responseCode",
  RESPONSE_BODY: "responseBody",
  MESSAGE: "message",

  // Status codes
  SUCCESS: {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
  },

  REDIRECTION: {
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    NOT_MODIFIED: 304,
  },

  CLIENT_ERROR: {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    PAYLOAD_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    TOO_MANY_REQUESTS: 429,
  },

  SERVER_ERROR: {
    SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
  },

  // Integers
  NUMBERS: {
    SHORT_ZERO: 0,
    SHORT_ONE: 1,
    SHORT_TWO: 2,
    SHORT_THREE: 3,
    SHORT_FOUR: 4,
    SHORT_FIVE: 5,
  },

  // Messages
  MESSAGES: {
    USER_LOGIN: "User Login Successfully !!",
    INVALID_CREDENTIAL: "Invalid Credential, Please try again!!",
    USER_CREATED: "User Created Successfully!!",
    USER_UPDATED: "Profile Updated Successfully!!",
    USER_DELETED: "User deleted Successfully!!",
    RECORD_FOUND: "Record Found Successfully!!",
    RECORD_NOT_FOUND: "Record Not Found!!",
    EMAIL_ALREADY_EXISTS: "Given email is already exits!!",
    USERNAME_ALREADY_EXISTS: "Given username is already exits!!",
    EMAIL_AND_USERNAME_NOT_NULL: "Email should not be null!!",
    SERVER_MESSAGE: "Internal Server !!",

    MODULE_UPDATED: "Module Updated Successfully!!",
    MODULE_CREATED: "Module Created Successfully!!",
    ROLE_MODULE_CREATED: "Role Module Created Successfully!!",
    ROLE_MODULE_UPDATED: "Role Module Updated Successfully!!",
    ROLE_UPDATED: "Role Updated Successfully!!",
    ROLE_CREATED: "Role Created Successfully!!",
    MODULE_NOT_FOUND: "Given module id is not found!!",
    ROLE_BAD_REQUEST: "Role module list should not be null or empty!!",
    ROLE_NOT_FOUND: "Role not found !!",
    ROLE_MODULE_NOT_FOUND: "Given role module id is not found !!",

    USER_BLOCKED: "User is inactive, Please contact to admin!!",
    OTP_NOT_SENT: "Otp sent failed!!",
    OTP_SENT: "Otp sent successfully!!",
    RESET_PASSWORD_SET: "Reset password successfully!!",
    OTP_NOT_VERIFY: "Otp is not verified, Please enter correct otp!!",
    OLD_PASSWORD_INCORRECT: "Old password is incorrect!!",
    PASSWORD_CHANGED: "Password Changed Successfully!!",
    EMAIL_VERIFIED: "Email verified successfully!!",
    USER_ALREADY_ACTIVE: "User is already active!!",
    USER_ALREADY_INACTIVE: "User is already Inactive!!",
    USER_ACTIVE: "User Active Successfully!!",
    USER_INACTIVE: "User Inactive Successfully!!",
    INVALID_REQUEST: "Invalid Request!!",

    COUNTRY_UPDATED: "Country updated successfully !!",
    COUNTRY_CREATED: "Country created successfully !!",
    CITY_CREATED: "City created successfully !!",
    CITY_UPDATED: "City updated successfully !!",
    COUNTRY_ID_NOT_NULL: "Country Id should not be null or empty !!",
    COUNTRY_NOT_FOUND: "Country not found !!",
    INVALID_USER_TYPE: "Invalid user type, It should be TWIK, INDIVIDUAL_TWIKER, BUSINESS_TWIKER !!",
    INVALID_POLICY_TYPE: "Invalid policy type, It should be PRIVACY_POLICY, TERMS_CONDITION_POLICY !!",
    USER_TYPE_NULL: "User type should not be null or empty !!",
    POLICY_TYPE_NULL: "Policy type should not be null or empty !!",
    FILE_NULL: "File should not be null or empty !!",
    SUCCESS: "Success",
    UPDATE: "Updated Successfully !!",
    CREATE: "Created Successfully !!",
    CITY_FILE_UPLOAD: "All city uploaded successfully !!",

    ROLE_ALREADY_ACTIVE: "Role is already activated !!",
    ROLE_ALREADY_INACTIVE: "Role is already deactivated !!",
    ROLE_DELETED: "Role deleted successfully !!",
    ROLE_ACTIVE: "Role is activated successfully !!",
    ROLE_INACTIVE: "Role is inactivate successfully !!",

    PAGINATION_REQUIRED: "Pagination is required !!",
    OTP_EXPIRED: "OTP has been expired, Please try with new one !!",
    INVALID_OTP: "Invalid OTP, Please enter correct OTP !!",
    TOKEN_NULL: "Token should not be null or empty !!",

    COUNTRY_DELETED: "Country deleted successfully !!",
    CITY_DELETED: "City deleted successfully !!",
    COUNTRY_BLOCKED: "Country inactive successfully !!",
    CITY_BLOCKED: "City inactive successfully !!",
    COUNTRY_UN_BLOCKED: "Country active successfully !!",
    CITY_UN_BLOCKED: "City active successfully !!",
    COUNTRY_ALREADY_BLOCKED: "Country already inactivated !!",
    CITY_ALREADY_BLOCKED: "City already inactivated !!",
    COUNTRY_ALREADY_UN_BLOCKED: "Country already activated !!",
    CITY_ALREADY_UN_BLOCKED: "City already activated !!",
    CITY_ALREADY_EXISTS: "City is already exits !!",
    DELETED: "Deleted successfully !!",
  },

  FLAGS: {
    TRUE: true,
    FALSE: false,
  },
};
