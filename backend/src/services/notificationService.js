const crypto = require("crypto");
const axios = require("axios");
const nodemailer = require("nodemailer");
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

const ensureEmergencyLiveShare = async (userId, location) => {
  const now = new Date();
  const existing = await LiveShareSession.findOne({
    user: userId,
    status: "active",
    expiresAt: { $gt: now },
  });
  if (existing) return existing;

  const lastLocation =
    typeof location?.latitude === "number" && typeof location?.longitude === "number"
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed,
          accuracy: location.accuracy,
          recordedAt: location.timestamp ? new Date(location.timestamp) : now,
        }
      : undefined;

  return LiveShareSession.create({
    user: userId,
    shareToken: crypto.randomBytes(24).toString("hex"),
    status: "active",
    lastLocation,
    expiresAt: new Date(now.getTime() + 120 * 60 * 1000),
  });
};

const createMailTransporter = () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  return nodemailer.createTransport({
    service: process.env.SMTP_SERVICE || "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
};

const buildEmergencyEmail = ({ userName, triggerReason, mapsUrl, liveShareUrl, notes }) => {
  const subject = `[NAVI Emergency Alert] ${userName} may need assistance`;
  const lines = [
    `NAVI Safety Alert for ${userName}`,
    `Reason: ${triggerReason}`,
    notes ? `Note: ${notes}` : null,
    mapsUrl ? `Last Known Location: ${mapsUrl}` : null,
    liveShareUrl ? `Live Tracking Link: ${liveShareUrl}` : null,
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="color: #b91c1c;">NAVI Emergency Alert</h2>
      <p><strong>${userName}</strong> triggered an emergency alert (<code>${triggerReason}</code>).</p>
      ${notes ? `<p><strong>Message:</strong> ${notes}</p>` : ""}
      ${mapsUrl ? `<p><a href="${mapsUrl}">Open Last Known Location in Google Maps</a></p>` : ""}
      ${liveShareUrl ? `<p><a href="${liveShareUrl}">View Live Location Updates</a></p>` : ""}
      <p style="color: #555; font-size: 12px;">Sent automatically by NAVI — Navigation Aware Vigilance Intelligence.</p>
    </div>
  `.trim();

  return { subject, text: lines.join("\n"), html };
};

const notifyTrustedContacts = async ({ userId, alert }) => {
  const [contacts, user, shareSession] = await Promise.all([
    TrustedContact.find({ user: userId, isActive: true, notifyOnEmergency: true }).lean(),
    User.findById(userId).select("name email").lean(),
    ensureEmergencyLiveShare(userId, alert.location),
  ]);

  const lat = alert.location?.latitude;
  const lon = alert.location?.longitude;
  const mapsUrl =
    typeof lat === "number" && typeof lon === "number"
      ? `https://maps.google.com/?q=${lat},${lon}`
      : null;

  const baseUrl = (process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");
  const liveShareUrl = `${baseUrl}/share/${shareSession.shareToken}`;
  const userName = user?.name || "NAVI User";
  const transporter = createMailTransporter();
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  const results = [];

  for (const contact of contacts) {
    const canShareLive = contact.canViewLiveLocation !== false;
    const contactLiveShareUrl = canShareLive ? liveShareUrl : null;
    const messagePayload = {
      alertId: String(alert._id),
      type: alert.type,
      triggerReason: alert.triggerReason,
      user: { id: String(userId), name: userName, email: user?.email || "" },
      contact: { id: String(contact._id), name: contact.name, phone: contact.phone, email: contact.email },
      location: alert.location || null,
      mapsUrl,
      liveShareUrl: contactLiveShareUrl,
      shareToken: canShareLive ? shareSession.shareToken : null,
      notes: alert.notes || null,
      timestamp: new Date().toISOString(),
    };

    let status = "logged_local";
    let channel = "in_app_log";
    let detail = "Logged locally (configure SMTP_USER/SMTP_PASS or ALERT_WEBHOOK_URL for delivery)";

    if (transporter && contact.email) {
      try {
        const emailContent = buildEmergencyEmail({
          userName,
          triggerReason: alert.triggerReason,
          mapsUrl,
          liveShareUrl: contactLiveShareUrl,
          notes: alert.notes,
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: contact.email,
          ...emailContent,
        });
        status = "dispatched";
        channel = "email";
        detail = `Email sent to ${contact.email}`;
      } catch (error) {
        status = "failed";
        channel = "email";
        detail = error.message || "Email delivery failed";
        console.error(`[NAVI Email Error] Failed sending to ${contact.email}:`, detail);
      }
    } else if (!transporter && contact.email) {
      console.warn(`[NAVI Email Skipped] Configure SMTP_USER and SMTP_PASS in backend/.env to email ${contact.email}`);
    }

    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, messagePayload, { timeout: 5000 });
        if (status !== "dispatched") {
          status = "dispatched";
          channel = "webhook";
          detail = "Delivered to ALERT_WEBHOOK_URL";
        }
      } catch (error) {
        if (status === "logged_local") {
          status = "failed";
          channel = "webhook";
          detail = error.message || "Webhook delivery failed";
        }
      }
    }

    results.push({
      contactId: contact._id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      channel,
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
    liveShareUrl,
    shareToken: shareSession.shareToken,
  });

  return results;
};

const sendPushToUser = async ({ userId, title, body, data = {} }) => {
  const user = await User.findById(userId).select("fcmToken").lean();
  if (!user?.fcmToken) return { sent: false, reason: "no_fcm_token" };

  // Support optional firebase-admin when installed & configured, or an external FCM relay webhook.
  let firebaseAdmin = null;
  try {
    firebaseAdmin = require("firebase-admin");
  } catch {
    firebaseAdmin = null;
  }

  if (firebaseAdmin && firebaseAdmin.apps?.length > 0) {
    try {
      await firebaseAdmin.messaging().send({
        token: user.fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default", contentAvailable: true } } },
      });
      return { sent: true, channel: "firebase_admin" };
    } catch (error) {
      return { sent: false, reason: error.message };
    }
  }

  if (process.env.FCM_WEBHOOK_URL) {
    try {
      await axios.post(
        process.env.FCM_WEBHOOK_URL,
        { token: user.fcmToken, title, body, data },
        { timeout: 5000 }
      );
      return { sent: true, channel: "fcm_webhook" };
    } catch (error) {
      return { sent: false, reason: error.message };
    }
  }

  return { sent: false, reason: "fcm_not_configured" };
};

const sendVerificationEmail = async ({ userId, contact, code }) => {
  const transporter = createMailTransporter();
  if (!transporter || !contact?.email) {
    return { sent: false, channel: "dev_fallback" };
  }
  const user = await User.findById(userId).select("name").lean();
  const userName = user?.name || "A NAVI User";
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: contact.email,
    subject: `[NAVI] Verify your trusted contact status for ${userName}`,
    text: `${userName} added you as a trusted emergency contact on NAVI.\nVerification code: ${code}\nThis code expires in 15 minutes.`,
  });
  return { sent: true, channel: "email" };
};

module.exports = {
  setSocketServer,
  emitToUser,
  emitToShareRoom,
  emitEmergencyStatus,
  ensureEmergencyLiveShare,
  buildEmergencyEmail,
  notifyTrustedContacts,
  sendVerificationEmail,
  sendPushToUser,
};
