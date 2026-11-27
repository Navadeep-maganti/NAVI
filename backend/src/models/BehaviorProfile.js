const mongoose = require("mongoose");

const behaviorProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    learnedAt: { type: Date, required: true },
    firstSeen: Date,
    lastSeen: Date,
    dataSufficiency: mongoose.Schema.Types.Mixed,
    regularPlaces: [mongoose.Schema.Types.Mixed],
    routineRoutes: [mongoose.Schema.Types.Mixed],
    activityPatterns: mongoose.Schema.Types.Mixed,
    movementBaseline: mongoose.Schema.Types.Mixed,
    noiseSummary: mongoose.Schema.Types.Mixed,
    unfamiliarLocations: [mongoose.Schema.Types.Mixed],
    learningConfig: mongoose.Schema.Types.Mixed,
    profileVersion: { type: String, default: "dbscan-v1" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BehaviorProfile", behaviorProfileSchema);
