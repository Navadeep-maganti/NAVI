const mongoose = require("mongoose");

const liveShareSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shareToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      index: true,
    },
    lastLocation: {
      latitude: Number,
      longitude: Number,
      speed: Number,
      accuracy: Number,
      recordedAt: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

liveShareSessionSchema.index({ user: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model("LiveShareSession", liveShareSessionSchema);

