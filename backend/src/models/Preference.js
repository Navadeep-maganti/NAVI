const mongoose = require("mongoose");

const preferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    lateNightThreshold: {
      type: Number,
      default: 23,
    },

    enableUnknownAreaAlerts: {
      type: Boolean,
      default: true,
    },

    deviationSensitivity: {
      type: Number,
      default: 0.7,
    },

    autoAlertTrustedContacts: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Preference", preferenceSchema);