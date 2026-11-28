const SafetyAlert = require("../models/SafetyAlert");
const {
  respondToAlert,
  resolveEscalatedAlert,
  triggerManualSOS,
  processExpiredCheckins,
} = require("../services/alertEscalationService");

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const manualSOS = async (req, res) => {
  try {
    const { latitude, longitude, speed = 0, accuracy = 10, timestamp, notes } = req.body;
    if (latitude !== undefined && (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90)) {
      return res.status(400).json({ success: false, message: "latitude is invalid" });
    }
    if (longitude !== undefined && (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180)) {
      return res.status(400).json({ success: false, message: "longitude is invalid" });
    }

    const alert = await triggerManualSOS({
      userId: req.user.id,
      location: { latitude, longitude, speed, accuracy, timestamp },
      notes,
    });
    return res.status(201).json({ success: true, alert });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to trigger SOS" });
  }
};

const respondToCheckin = async (req, res) => {
  try {
    const { response } = req.body;
    if (!["safe", "need_help", "cancel"].includes(response)) {
      return res.status(400).json({
        success: false,
        message: "response must be one of: safe, need_help, cancel",
      });
    }

    const result = await respondToAlert({
      userId: req.user.id,
      alertId: req.params.id,
      response,
    });
    if (result.notFound) {
      return res.status(404).json({ success: false, message: "Alert not found" });
    }
    if (result.conflict) {
      return res.status(409).json({
        success: false,
        message: `Alert is already ${result.alert.status}`,
        alert: result.alert,
      });
    }
    return res.status(200).json({ success: true, alert: result.alert });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to respond to alert" });
  }
};

const getMyAlerts = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const alerts = await SafetyAlert.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.status(200).json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch alerts" });
  }
};

const runEscalationSweep = async (req, res) => {
  try {
    const summary = await processExpiredCheckins();
    return res.status(200).json({ success: true, ...summary });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to process escalations" });
  }
};

const resolveAlert = async (req, res) => {
  try {
    const result = await resolveEscalatedAlert({
      userId: req.user.id,
      alertId: req.params.id,
    });
    if (result.notFound) {
      return res.status(404).json({ success: false, message: "Alert not found" });
    }
    if (result.conflict) {
      return res.status(409).json({
        success: false,
        message: `Alert is ${result.alert.status}, not escalated`,
        alert: result.alert,
      });
    }
    return res.status(200).json({ success: true, alert: result.alert });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to resolve alert" });
  }
};

module.exports = {
  manualSOS,
  respondToCheckin,
  resolveAlert,
  getMyAlerts,
  runEscalationSweep,
};

