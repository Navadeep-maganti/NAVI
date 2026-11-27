const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        latitude: {
            type: Number,
            required: true,
            min: -90,
            max: 90,
        },

        longitude: {
            type: Number,
            required: true,
            min: -180,
            max: 180,
        },

        altitude: {
            type: Number,
            required: true,
            min: -11000,
            max: 100000,
        },

        speed: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Horizontal accuracy reported by the device, in metres.
        accuracy: {
            type: Number,
            required: true,
            min: 0,
        },

        recordedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

locationSchema.index({ user: 1, recordedAt: -1 });

module.exports = mongoose.model("Location",locationSchema);
