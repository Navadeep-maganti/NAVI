const SafeSession = require("../models/SafeSession");

const ACTIVITY_DEFAULTS = {
  commute: { expectedMaxSpeedMps: 25, suppressTimeAlerts: false, suppressLocationAlerts: false },
  jogging: { expectedMaxSpeedMps: 6, suppressTimeAlerts: false, suppressLocationAlerts: false },
  cycling: { expectedMaxSpeedMps: 14, suppressTimeAlerts: false, suppressLocationAlerts: false },
  night_shift: { expectedMaxSpeedMps: 20, suppressTimeAlerts: true, suppressLocationAlerts: false },
  traveling: { expectedMaxSpeedMps: 35, suppressTimeAlerts: true, suppressLocationAlerts: true },
  social_event: { expectedMaxSpeedMps: 15, suppressTimeAlerts: true, suppressLocationAlerts: true },
  custom: { expectedMaxSpeedMps: null, suppressTimeAlerts: false, suppressLocationAlerts: false },
};

const startSafeSession = async (req, res) => {
  try {
    const {
      activityType,
      label,
      durationMinutes = 60,
      anchorLocation,
      expectedMaxSpeedMps,
      suppressTimeAlerts,
      suppressLocationAlerts,
    } = req.body;

    if (!activityType || !ACTIVITY_DEFAULTS[activityType]) {
      return res.status(400).json({
        success: false,
        message: `activityType must be one of: ${Object.keys(ACTIVITY_DEFAULTS).join(", ")}`,
      });
    }
    const mins = Number(durationMinutes);
    if (!Number.isFinite(mins) || mins < 5 || mins > 720) {
      return res.status(400).json({
        success: false,
        message: "durationMinutes must be between 5 and 720",
      });
    }

    // End any previously active session for this user so only one session is active at a time.
    await SafeSession.updateMany(
      { user: req.user.id, status: "active" },
      { $set: { status: "ended", endsAt: new Date() } }
    );

    const defaults = ACTIVITY_DEFAULTS[activityType];
    const now = new Date();
    const session = await SafeSession.create({
      user: req.user.id,
      activityType,
      label,
      status: "active",
      anchorLocation,
      expectedMaxSpeedMps: expectedMaxSpeedMps ?? defaults.expectedMaxSpeedMps,
      suppressTimeAlerts: suppressTimeAlerts ?? defaults.suppressTimeAlerts,
      suppressLocationAlerts: suppressLocationAlerts ?? defaults.suppressLocationAlerts,
      startsAt: now,
      endsAt: new Date(now.getTime() + mins * 60 * 1000),
    });

    return res.status(201).json({ success: true, session });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to start safe session" });
  }
};

const getActiveSafeSession = async (req, res) => {
  try {
    const now = new Date();
    const session = await SafeSession.findOne({
      user: req.user.id,
      status: "active",
      endsAt: { $gt: now },
    }).lean();

    return res.status(200).json({ success: true, session: session || null });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch safe session" });
  }
};

const endSafeSession = async (req, res) => {
  try {
    const session = await SafeSession.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: "active" },
      { $set: { status: "ended", endsAt: new Date() } },
      { new: true }
    );
    if (!session) {
      return res.status(404).json({ success: false, message: "Active safe session not found" });
    }
    return res.status(200).json({ success: true, session });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to end safe session" });
  }
};

module.exports = {
  startSafeSession,
  getActiveSafeSession,
  endSafeSession,
};

