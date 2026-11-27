const axios = require("axios");
const TrustedContact = require("../models/TrustedContact");
const User = require("../models/User");
const LiveShareSession = require("../models/LiveShareSession");

let socketServer = null;

const setSocketServer = (io) => {
  socketServer = io;
};

const emitToUser = (userId, event, payload) => {
  if (socketServer) {
    socketServer.to(`user:${String(userId)}`).emit(event, payload);
  }
};

const emitToShareRoom = (shareToken, event, payload) => {
  if (socketServer && shareToken) {
    socketServer.to(`share:${shareToken}`).emit(event, payload);
  }
};

const emitEmergencyStatus = async (userId, payload) => {
  emitToUser(userId, "emergency:status", payload);
  if (!socketServer) return;

  const now = new Date();
  const activeShares = await LiveShareSession.find({
    user: userId,
    status: "active",
    expiresAt: { $gt: now },
  })
    .select("shareToken")
    .lean();

  for (const share of activeShares) {
    emitToShareRoom(share.shareToken, "emergency:status", payload);
  }
};

const notifyTrustedContacts = async ({ userId, alert }) => {
  const [contacts, user] = await Promise.all([
    TrustedContact.find({ user: userId, isActive: true, notifyOnEmergency: true }).lean(),
    User.findById(userId).select("name email").lean(),
  ]);

  const lat = alert.location?.latitude;
  const lon = alert.location?.longitude;
  const mapsUrl =
    typeof lat === "number" && typeof lon === "number"
      ? `https://maps.google.com/?q=${lat},${lon}`
      : null;

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  const results = [];

  for (const contact of contacts) {
    const messagePayload = {
      alertId: String(alert._id),
      type: alert.type,
      triggerReason: alert.triggerReason,
      user: { id: String(userId), name: user?.name || "SafeCity User", email: user?.email || "" },
      contact: { id: String(contact._id), name: contact.name, phone: contact.phone, email: contact.email },
      location: alert.location || null,
      mapsUrl,
      notes: alert.notes || null,
      timestamp: new Date().toISOString(),
    };

    let status = "logged_local";
    let detail = "Logged locally (configure ALERT_WEBHOOK_URL for external SMS/email gateway)";

    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, messagePayload, { timeout: 5000 });
        status = "dispatched";
        detail = "Delivered to ALERT_WEBHOOK_URL";
      } catch (error) {
        status = "failed";
        detail = error.message || "Webhook delivery failed";
      }
    }

    results.push({
      contactId: contact._id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      channel: webhookUrl ? "webhook" : "in_app_log",
      status,
      sentAt: new Date(),
      detail,
    });
  }

  emitToUser(userId, "emergency:escalated", {
    alertId: String(alert._id),
    type: alert.type,
    triggerReason: alert.triggerReason,
    notifiedCount: results.length,
    mapsUrl,
  });

  return results;
};

module.exports = {
  setSocketServer,
  emitToUser,
  emitToShareRoom,
  emitEmergencyStatus,
  notifyTrustedContacts,
};

