const mongoose = require("mongoose");

const notifiedContactSchema = new mongoose.Schema(
  {
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "TrustedContact" },
    name: String,
    phone: String,
    email: String,
    channel: { type: String, default: "in_app_and_webhook" },
    status: { type: String, enum: ["dispatched", "logged_local", "failed"], default: "logged_local" },
    sentAt: { type: Date, default: Date.now },
    detail: String,
  },
  { _id: false }
);

const safetyAlertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["checkin", "manual_sos", "escalated_emergency"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending_checkin", "resolved_safe", "escalated", "cancelled"],
      required: true,
      index: true,
    },
    triggerReason: {
      type: String,
      required: true,
    },
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      speed: Number,
      accuracy: Number,
      timestamp: Date,
    },
    decisionSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    checkinDeadline: {
      type: Date,
      default: null,
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    userResponse: {
      type: String,
      enum: ["safe", "need_help", "no_response", null],
      default: null,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    notifiedContacts: [notifiedContactSchema],
  },
  { timestamps: true }
);

safetyAlertSchema.index({ user: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("SafetyAlert", safetyAlertSchema);

