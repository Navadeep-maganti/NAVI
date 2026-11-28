const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
        },

        password: {
            type: String,
            required: true,
        },

        locationTrackingConsent: {
            type: Boolean,
            default: true,
        },

        consentUpdatedAt: {
            type: Date,
            default: Date.now,
        },

        dataRetentionDays: {
            type: Number,
            default: 30,
            min: 7,
            max: 90,
        },

        fcmToken: {
            type: String,
            default: null,
        },

        pushPlatform: {
            type: String,
            enum: ["android", "ios", null],
            default: null,
        },

        travelMode: {
            active: { type: Boolean, default: false },
            mode: { type: String, enum: ["roaming", "local_pattern"], default: "roaming" },
            startedAt: { type: Date, default: null },
            lastPromptedAt: { type: Date, default: null },
            dismissedUntil: { type: Date, default: null },
            temporaryProfile: { type: mongoose.Schema.Types.Mixed, default: null },
            completedTripWindows: [
                {
                    start: { type: Date, required: true },
                    end: { type: Date, required: true },
                },
            ],
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);