# Encryption API

Device-based E2EE backend for account provisioning, activation, public-key/prekey distribution, authenticated devices, and ciphertext routing.

## Setup

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Run `npm run dev` for development or `npm start` for production.

## Endpoints

- `POST /api/v1/mobileUser` — admin provisions a mobile user
- `POST /api/v1/mobileUser/:userId/generate-serial` — admin generates an activation code
- `POST /api/v1/auth/activate` — validate an activation code
- `POST /api/v1/auth/refresh` and `/logout` — rotate/revoke refresh tokens
- `POST /api/v1/devices/register` — register public device identity material
- `GET /api/v1/devices` and `DELETE /api/v1/devices/:deviceId` — manage devices
- `POST /api/v1/keys/prekeys` and `/prekeys/replenish` — upload public prekeys
- `GET /api/v1/keys/prekey-bundle/:userId` — consume a public prekey bundle
- `GET /api/v1/docs` — Swagger documentation

Private keys, message plaintext, message keys, decrypted attachments, and call E2EE keys are forbidden. They must remain on endpoint devices.

## Structure

```text
src/
  config/        Database and Swagger configuration
  constants/     Shared constants
  controllers/   HTTP request handlers
  models/        Mongoose schemas
  repositories/  Database access
  routes/        Express routes
  middleware/    Authentication, rate limiting, and sensitive-material rejection
  socket/        Authenticated Socket.IO foundation
  jobs/          BullMQ job producers
  workers/       BullMQ consumers
  validators/    Request validation
  services/      Business logic
  utils/         Logging, errors, and responses
  index.js       Application entry point
```
