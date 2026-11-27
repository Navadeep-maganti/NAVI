const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const LiveShareSession = require("../models/LiveShareSession");
const { setSocketServer } = require("./notificationService");

const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, { cors: { origin: "*" } });

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];
    const shareToken =
      socket.handshake.auth?.shareToken || socket.handshake.query?.shareToken;

    if (token) {
      try {
        socket.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
      } catch {
        return next(new Error("Invalid token"));
      }
    }

    if (typeof shareToken === "string" && shareToken.trim()) {
      const now = new Date();
      const session = await LiveShareSession.findOne({
        shareToken: shareToken.trim(),
        status: "active",
        expiresAt: { $gt: now },
      }).lean();

      if (!session) {
        return next(new Error("Invalid or expired share token"));
      }
      socket.shareToken = session.shareToken;
      return next();
    }

    return next(new Error("Authentication or shareToken required"));
  });

  io.on("connection", (socket) => {
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
    if (socket.shareToken) {
      socket.join(`share:${socket.shareToken}`);
    }
  });

  setSocketServer(io);
  return io;
};

module.exports = { initSocketServer };

