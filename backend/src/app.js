require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const axios = require("axios");

const connectDB = require("./utils/db");
const { createRateLimiter } = require("./middleware/rateLimit");

const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const preferenceRoutes = require("./routes/preferenceRoutes");
const contactRoutes = require("./routes/contactRoutes");
const mlRoutes = require("./routes/mlRoutes");
const areaRiskRoutes = require("./routes/areaRiskRoutes");
const safeSessionRoutes = require("./routes/safeSessionRoutes");
const alertRoutes = require("./routes/alertRoutes");
const liveShareRoutes = require("./routes/liveShareRoutes");
const privacyRoutes = require("./routes/privacyRoutes");
const { initSocketServer } = require("./services/socketService");
const { processExpiredCheckins } = require("./services/alertEscalationService");
const { runPeriodicReclustering } = require("./services/adaptiveLearningService");

const app = express();

connectDB();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use(express.json());

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const mlLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

app.get("/health", async (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  let mlOk = false;
  try {
    const mlUrl = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";
    const resp = await axios.get(`${mlUrl}/health`, { timeout: 2000 });
    mlOk = resp.status === 200;
  } catch {
    mlOk = false;
  }
  return res.status(dbReady ? 200 : 503).json({
    status: dbReady && mlOk ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    mongodb: dbReady ? "connected" : "disconnected",
    mlService: mlOk ? "reachable" : "unreachable",
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/ml", mlLimiter, mlRoutes);
app.use("/api/area-risk", areaRiskRoutes);
app.use("/api/safe-sessions", safeSessionRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/live-share", liveShareRoutes);
app.use("/api/privacy", privacyRoutes);

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
initSocketServer(server);

// Sweep overdue safety check-ins every 30s so non-responses escalate automatically.
const escalationTimer = setInterval(() => {
  processExpiredCheckins().catch((err) => {
    console.error("Escalation sweep failed:", err.message);
  });
}, 30000);
escalationTimer.unref();

// Periodically re-cluster stale behavioral profiles over a rolling 30-day window (every 6 hours).
const reclusterTimer = setInterval(() => {
  runPeriodicReclustering({ staleAfterHours: 24, batchLimit: 25 }).catch((err) => {
    console.error("Periodic re-clustering failed:", err.message);
  });
}, 6 * 60 * 60 * 1000);
reclusterTimer.unref();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`SafeCity backend running on port ${PORT}`);
});
