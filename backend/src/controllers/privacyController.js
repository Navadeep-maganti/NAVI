const User = require("../models/User");
const Location = require("../models/Location");
const BehaviorProfile = require("../models/BehaviorProfile");
const LiveShareSession = require("../models/LiveShareSession");
const SafetyAlert = require("../models/SafetyAlert");

const getPrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("locationTrackingConsent consentUpdatedAt dataRetentionDays")
      .lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, privacy: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch privacy settings" });
  }
};

const updatePrivacyConsent = async (req, res) => {
  try {
    const { locationTrackingConsent, dataRetentionDays } = req.body;
    const updates = {};
    if (locationTrackingConsent !== undefined) {
      if (typeof locationTrackingConsent !== "boolean") {
        return res.status(400).json({ success: false, message: "locationTrackingConsent must be boolean" });
      }
      updates.locationTrackingConsent = locationTrackingConsent;
      updates.consentUpdatedAt = new Date();
    }
    if (dataRetentionDays !== undefined) {
      const days = Number(dataRetentionDays);
      if (!Number.isInteger(days) || days < 7 || days > 90) {
        return res.status(400).json({ success: false, message: "dataRetentionDays must be an integer 7..90" });
      }
      updates.dataRetentionDays = days;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true })
      .select("locationTrackingConsent consentUpdatedAt dataRetentionDays")
      .lean();
    return res.status(200).json({ success: true, privacy: user });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to update privacy settings" });
  }
};

const deleteMyLocationData = async (req, res) => {
  try {
    const [locations, profiles, shares, alerts] = await Promise.all([
      Location.deleteMany({ user: req.user.id }),
      BehaviorProfile.deleteMany({ user: req.user.id }),
      LiveShareSession.deleteMany({ user: req.user.id }),
      SafetyAlert.deleteMany({ user: req.user.id }),
    ]);

    return res.status(200).json({
      success: true,
      deleted: {
        locations: locations.deletedCount,
        behaviorProfiles: profiles.deletedCount,
        liveShareSessions: shares.deletedCount,
        safetyAlerts: alerts.deletedCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to purge location data" });
  }
};

module.exports = {
  getPrivacySettings,
  updatePrivacyConsent,
  deleteMyLocationData,
};

