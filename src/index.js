require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const http = require("http");
const swaggerUi = require("swagger-ui-express");
const connectDB = require("./config/DBConfig");
const adminUserRoutes = require("./routes/AdminUserRoute");
const moduleRoutes = require("./routes/ModuleRoute");
const roleRoutes = require("./routes/RoleRoute");
const userRoutes = require("./routes/UserRoute");
const notificationRoutes = require("./routes/NotificationRoute");
const appContentRoutes = require("./routes/AppContentRoute");
const mobileUserDeviceRoutes = require("./routes/MobileUserDeviceRoute");
const conversationRoutes = require("./routes/ConversationRoute");
const messageRoutes = require("./routes/MessageRoute");
const userSearchRoutes = require("./routes/UserSearchRoute");
const initializeSocket = require("./socket");

const swaggerSpec = require("./config/SwaggerConfig"); // 👈 import swagger config

const app = express();
app.use(cors());
app.use(morgan("dev"));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));


//app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Swagger docs should match API versioning
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ✅ All admin routes
app.use("/api/v1/user", adminUserRoutes);
// ✅ Module routes
app.use("/api/v1/module", moduleRoutes);
// ✅ Role routes
app.use("/api/v1/role", roleRoutes);
app.use("/api/v1/notification", notificationRoutes);
app.use("/api/v1/mobileUser", userRoutes);
app.use("/api/v1", mobileUserDeviceRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/users", userSearchRoutes);


// ✅ App Content routes
app.use("/api/v1/content", appContentRoutes);




// Health check
app.get("/health", (_, res) => res.json({ status: "up" }));

const PORT = process.env.PORT || 6000;
const server = http.createServer(app);
const io = initializeSocket(server);
app.set("io", io);

async function start() {
  await connectDB();
  return server.listen(PORT, () => console.log(`Service running on port ${PORT}`));
}

if (require.main === module) {
  start().catch(error => {
    console.error("Service startup failed", error.message);
    process.exit(1);
  });
}

module.exports = { app, server, start };
