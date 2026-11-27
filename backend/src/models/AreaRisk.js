const mongoose = require("mongoose");

const areaRiskSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      // GeoJSON order: [longitude, latitude]
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coords) =>
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90,
          message: "coordinates must be [longitude, latitude] within valid bounds",
        },
      },
    },
    radiusMetres: {
      type: Number,
      default: 300,
      min: 20,
      max: 10000,
    },
    baseRiskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    riskFactors: {
      type: [String],
      default: [],
    },
    timeProfile: {
      dayMultiplier: { type: Number, default: 0.85, min: 0, max: 2 },
      nightMultiplier: { type: Number, default: 1.3, min: 0, max: 2 },
      weekendMultiplier: { type: Number, default: 1.0, min: 0, max: 2 },
    },
    source: {
      type: String,
      enum: ["seeded", "official_feed", "crowd_report"],
      default: "seeded",
    },
    confidence: {
      type: Number,
      default: 0.8,
      min: 0,
      max: 1,
    },
    reportCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reporters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

areaRiskSchema.index({ location: "2dsphere" });
areaRiskSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AreaRisk", areaRiskSchema);

