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
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);