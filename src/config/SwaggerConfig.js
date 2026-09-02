const swaggerJSDoc = require("swagger-jsdoc");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Encryption API",
      version: "1.0.0",
      description: "API documentation for encryption app",
    },
    servers: [
       {
        url: "http://localhost:6001", // change in prod
        description: "Local server",
      },
      
     
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT", // optional
        },
      },
      schemas: {
        ActivationRequest: {
          type: "object",
          required: ["serialId"],
          properties: {
            serialId: {
              type: "string",
              example: "ENC-4F2D8A71C93B5E60A118D7924A8FDF01"
            }
          }
        },
        MobileUserStatusRequest: {
          type: "object",
          required: ["id", "status"],
          properties: {
            id: {
              type: "string",
              description: "Mobile user ID",
              example: "6a92b248925e136b61d15b58"
            },
            status: {
              type: "integer",
              enum: [0, 1, 2],
              description: "0 = DELETED, 1 = ACTIVE, 2 = BLOCKED",
              example: 2
            },
            remark: {
              type: "string",
              maxLength: 500,
              example: "Blocked by administrator"
            }
          }
        },
        MobileOtpRequest: {
          type: "object",
          required: ["mobileNumber"],
          properties: {
            mobileNumber: {
              type: "string",
              example: "9876543210"
            }
          }
        },
        MobileOtpVerifyRequest: {
          type: "object",
          required: ["OTP", "mobileNumber", "deviceToken", "deviceType"],
          properties: {
            OTP: {
              type: "string",
              pattern: "^[0-9]{4}$",
              minLength: 4,
              maxLength: 4,
              example: "1234"
            },
            mobileNumber: {
              type: "string",
              example: "9876543210"
            },
            deviceToken: {
              type: "string",
              example: "FCM_DEVICE_TOKEN"
            },
            deviceType: {
              type: "string",
              enum: ["ANDROID", "IOS"],
              example: "ANDROID"
            }
          }
        },
        RefreshTokenRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: {
              type: "string",
              description: "Opaque refresh token issued during device registration or token rotation",
              example: "refresh-token-value"
            }
          }
        },
        DeviceRegistrationRequest: {
          type: "object",
          required: ["activationToken", "deviceId", "deviceType", "identityKey", "identityKeyAlgorithm"],
          properties: {
            activationToken: {
              type: "string",
              description: "Short-lived token returned by /api/v1/auth/activate"
            },
            deviceId: {
              type: "string",
              example: "0f58db6c-60c8-4c96-8323-8aab42f85f29"
            },
            deviceType: {
              type: "string",
              enum: ["ANDROID", "IOS"],
              example: "ANDROID"
            },
            deviceName: {
              type: "string",
              example: "Pixel 9"
            },
            identityKey: {
              type: "string",
              description: "Device-generated PUBLIC identity key only",
              example: "BASE64_PUBLIC_IDENTITY_KEY"
            },
            identityKeyAlgorithm: {
              type: "string",
              example: "X25519"
            },
            registrationId: {
              type: "integer",
              example: 12345
            }
          }
        },
        PublicPrekey: {
          type: "object",
          required: ["keyId", "publicKey"],
          properties: {
            keyId: { type: "integer", example: 1 },
            publicKey: {
              type: "string",
              description: "Public prekey material only",
              example: "BASE64_PUBLIC_PREKEY"
            }
          }
        },
        PrekeyUploadRequest: {
          type: "object",
          required: ["deviceId", "signedPrekey", "signedPrekeySignature"],
          properties: {
            deviceId: {
              type: "string",
              example: "0f58db6c-60c8-4c96-8323-8aab42f85f29"
            },
            signedPrekey: { $ref: "#/components/schemas/PublicPrekey" },
            signedPrekeySignature: {
              type: "string",
              example: "BASE64_SIGNED_PREKEY_SIGNATURE"
            },
            oneTimePrekeys: {
              type: "array",
              maxItems: 100,
              items: { $ref: "#/components/schemas/PublicPrekey" }
            }
          }
        },
        PrekeyReplenishRequest: {
          type: "object",
          required: ["deviceId", "preKeys"],
          properties: {
            deviceId: {
              type: "string",
              example: "0f58db6c-60c8-4c96-8323-8aab42f85f29"
            },
            preKeys: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { $ref: "#/components/schemas/PublicPrekey" }
            },
            oneTimePrekeys: {
              type: "array",
              deprecated: true,
              description: "Legacy alias for preKeys; accepted for mobile-app compatibility",
              minItems: 1,
              maxItems: 100,
              items: { $ref: "#/components/schemas/PublicPrekey" }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/controllers/*.js"], // path to your route/controller files
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

module.exports = swaggerSpec;
