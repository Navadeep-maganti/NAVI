const mongoose = require("mongoose");

const safeSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activityType: {
      type: String,
      enum: ["commute", "jogging", "cycling", "night_shift", "traveling", "social_event", "custom"],
      required: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
    },
    // Optional safe anchor area (e.g. venue or route midpoint).
    anchorLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      radiusMetres: { type: Number, min: 50, max: 50000, default: 1000 },
    },
    expectedMaxSpeedMps: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    suppressTimeAlerts: {
      type: Boolean,
      default: false,
    },
    suppressLocationAlerts: {
      type: Boolean,
      default: false,
    },
    startsAt: {
      type: Date,
      default: Date.now,
    },
    endsAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

safeSessionSchema.index({ user: 1, status: 1, endsAt: 1 });

module.exports = mongoose.model("SafeSession", safeSessionSchema);

