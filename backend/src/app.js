require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const connectDB = require("./utils/db");

const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const preferenceRoutes = require("./routes/preferenceRoutes");
const contactRoutes = require("./routes/contactRoutes");
const mlRoutes = require("./routes/mlRoutes");
const areaRiskRoutes = require("./routes/areaRiskRoutes");
const safeSessionRoutes = require("./routes/safeSessionRoutes");
const alertRoutes = require("./routes/alertRoutes");
const { setSocketServer } = require("./services/notificationService");
const { processExpiredCheckins } = require("./services/alertEscalationService");

const app = express();

connectDB();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/area-risk", areaRiskRoutes);
app.use("/api/safe-sessions", safeSessionRoutes);
app.use("/api/alerts", alertRoutes);

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body. Send a raw JSON object, not a quoted JSON string.",
    });
  }

  next(err);
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
  if (!token) return next(new Error("Authentication required"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    return next();
  } catch {
    return next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  if (socket.user?.id) {
    socket.join(`user:${socket.user.id}`);
  }
});

setSocketServer(io);

// Sweep overdue safety check-ins every 30s so non-responses escalate automatically.
const escalationTimer = setInterval(() => {
  processExpiredCheckins().catch((err) => {
    console.error("Escalation sweep failed:", err.message);
  });
}, 30000);
escalationTimer.unref();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`SafeCity backend running on port ${PORT}`);
});
