const crypto = require("crypto");
const LiveShareSession = require("../models/LiveShareSession");
const SafetyAlert = require("../models/SafetyAlert");
const { emitToShareRoom } = require("../services/notificationService");

const startLiveShare = async (req, res) => {
  try {
    const mins = req.body?.durationMinutes === undefined ? 60 : Number(req.body.durationMinutes);
    if (!Number.isFinite(mins) || mins < 5 || mins > 720) {
      return res.status(400).json({
        success: false,
        message: "durationMinutes must be between 5 and 720",
      });
    }

    const now = new Date();
    const activeExisting = await LiveShareSession.find({
      user: req.user.id,
      status: "active",
    });
    for (const prev of activeExisting) {
      prev.status = "ended";
      prev.expiresAt = now;
      await prev.save();
      emitToShareRoom(prev.shareToken, "live-share:ended", { shareToken: prev.shareToken });
    }

    const shareToken = crypto.randomBytes(24).toString("hex");
    const session = await LiveShareSession.create({
      user: req.user.id,
      shareToken,
      status: "active",
      expiresAt: new Date(now.getTime() + mins * 60 * 1000),
    });

    return res.status(201).json({ success: true, session });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to start live share" });
  }
};

const stopLiveShare = async (req, res) => {
  try {
    const now = new Date();
    const session = await LiveShareSession.findOneAndUpdate(
      { user: req.user.id, status: "active" },
      { $set: { status: "ended", expiresAt: now } },
      { new: true }
    );
    if (!session) {
      return res.status(404).json({ success: false, message: "No active live share session found" });
    }

    emitToShareRoom(session.shareToken, "live-share:ended", { shareToken: session.shareToken });
    return res.status(200).json({ success: true, session });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to stop live share" });
  }
};

const getActiveLiveShare = async (req, res) => {
  try {
    const now = new Date();
    const session = await LiveShareSession.findOne({
      user: req.user.id,
      status: "active",
      expiresAt: { $gt: now },
    }).lean();
    return res.status(200).json({ success: true, session: session || null });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch live share" });
  }
};

// Public token-gated viewer endpoint for trusted contacts opening a live-share link.
const viewLiveShareByToken = async (req, res) => {
  try {
    const now = new Date();
    const session = await LiveShareSession.findOne({
      shareToken: req.params.token,
      status: "active",
      expiresAt: { $gt: now },
    })
      .populate("user", "name")
      .lean();

    if (!session) {
      return res.status(404).json({ success: false, message: "Live share session is inactive or expired" });
    }

    const activeEmergency = await SafetyAlert.findOne({
      user: session.user._id,
      status: { $in: ["pending_checkin", "escalated"] },
    })
      .sort({ createdAt: -1 })
      .select("type status triggerReason createdAt escalatedAt")
      .lean();

    return res.status(200).json({
      success: true,
      sharedBy: session.user?.name || "NAVI User",
      lastLocation: session.lastLocation || null,
      expiresAt: session.expiresAt,
      emergencyStatus: activeEmergency || null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to load live share" });
  }
};

module.exports = {
  startLiveShare,
  stopLiveShare,
  getActiveLiveShare,
  viewLiveShareByToken,
};

