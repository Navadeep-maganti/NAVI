const crypto = require("crypto");
const AreaRisk = require("../models/AreaRisk");

const DEFAULT_CROWD_EXPIRY_DAYS = 30;
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const resolveCrowdExpiry = (expiresAt, now = new Date()) => {
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== "") {
    const parsed = new Date(expiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(now.getTime() + DEFAULT_CROWD_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
};

const requireAdminKey = (req, res, next) => {
  const configuredKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers["x-admin-key"];
  if (!configuredKey || typeof providedKey !== "string") {
    return res.status(403).json({ success: false, message: "Admin key required for this operation" });
  }
  const expected = Buffer.from(configuredKey);
  const actual = Buffer.from(providedKey);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return res.status(403).json({ success: false, message: "Invalid admin key" });
  }
  return next();
};

const findActiveAreaZones = async (latitude, longitude, maxDistanceMetres = 2000) => {
  const now = new Date();
  const zones = await AreaRisk.find({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: maxDistanceMetres,
      },
    },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .limit(20)
    .lean();

  return zones.map((zone) => ({
    id: String(zone._id),
    name: zone.name || null,
    latitude: zone.location.coordinates[1],
    longitude: zone.location.coordinates[0],
    radiusMetres: zone.radiusMetres,
    baseRiskScore: zone.baseRiskScore,
    riskFactors: zone.riskFactors || [],
    timeProfile: zone.timeProfile || {},
    source: zone.source,
    confidence: zone.confidence,
    reportCount: zone.reportCount,
    updatedAt: zone.updatedAt ? zone.updatedAt.toISOString() : null,
  }));
};

// User-facing endpoint: always stored as low-trust crowd_report until multiple distinct users confirm.
const upsertAreaRisk = async (req, res) => {
  try {
    const {
      name,
      latitude,
      longitude,
      radiusMetres = 300,
      baseRiskScore,
      riskFactors = [],
      timeProfile,
      expiresAt,
    } = req.body;

    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isFiniteNumber(baseRiskScore)) {
      return res.status(400).json({
        success: false,
        message: "latitude, longitude, and baseRiskScore must be finite numbers",
      });
    }
    if (baseRiskScore < 0 || baseRiskScore > 1) {
      return res.status(400).json({ success: false, message: "baseRiskScore must be between 0 and 1" });
    }

    const now = new Date();
    const existing = await AreaRisk.findOne({
      source: "crowd_report",
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: 100,
        },
      },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });

    if (existing) {
      const userId = String(req.user.id);
      const alreadyReported = (existing.reporters || []).some((id) => String(id) === userId);
      if (alreadyReported) {
        return res.status(409).json({
          success: false,
          message: "You have already reported this area",
        });
      }

      const prevCount = existing.reportCount || 1;
      const nextCount = prevCount + 1;
      existing.reporters = [...(existing.reporters || []), req.user.id];
      existing.baseRiskScore = Number(
        ((existing.baseRiskScore * prevCount + baseRiskScore) / nextCount).toFixed(3)
      );
      existing.reportCount = nextCount;
      // Quorum confidence: 0.25 for 1 reporter, scaling up to 0.85 with 4+ distinct reporters.
      existing.confidence = Math.min(0.85, Number((0.25 + (nextCount - 1) * 0.2).toFixed(2)));
      if (Array.isArray(riskFactors) && riskFactors.length > 0) {
        existing.riskFactors = Array.from(new Set([...existing.riskFactors, ...riskFactors]));
      }
      // Refresh 30-day TTL whenever a crowd report is corroborated.
      existing.expiresAt = resolveCrowdExpiry(expiresAt, now);
      await existing.save();
      return res.status(200).json({ success: true, merged: true, areaRisk: existing });
    }

    const created = await AreaRisk.create({
      name,
      location: { type: "Point", coordinates: [longitude, latitude] },
      radiusMetres,
      baseRiskScore,
      riskFactors,
      timeProfile,
      source: "crowd_report",
      confidence: 0.25,
      reportCount: 1,
      reportedBy: req.user.id,
      reporters: [req.user.id],
      expiresAt: resolveCrowdExpiry(expiresAt, now),
    });

    return res.status(201).json({ success: true, merged: false, areaRisk: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to store area risk" });
  }
};

// Admin/trusted-feed endpoint: ingests single or batch official_feed / seeded zones.
const upsertOfficialAreaRisk = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.zones) ? req.body.zones : [req.body];
    if (items.length === 0 || items.length > 200) {
      return res.status(400).json({ success: false, message: "Provide between 1 and 200 zones" });
    }

    const saved = [];
    for (const item of items) {
      const {
        name,
        latitude,
        longitude,
        radiusMetres = 300,
        baseRiskScore,
        riskFactors = [],
        timeProfile,
        source = "official_feed",
        confidence = 0.9,
        expiresAt = null,
      } = item || {};

      if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isFiniteNumber(baseRiskScore)) {
        return res.status(400).json({
          success: false,
          message: "Each zone requires finite latitude, longitude, and baseRiskScore",
        });
      }
      if (!["official_feed", "seeded"].includes(source)) {
        return res.status(400).json({ success: false, message: "source must be official_feed or seeded" });
      }

      const existing = await AreaRisk.findOne({
        source,
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [longitude, latitude] },
            $maxDistance: 75,
          },
        },
      });

      if (existing) {
        existing.name = name ?? existing.name;
        existing.radiusMetres = radiusMetres;
        existing.baseRiskScore = baseRiskScore;
        existing.riskFactors = riskFactors;
        if (timeProfile) existing.timeProfile = timeProfile;
        existing.confidence = confidence;
        existing.expiresAt = expiresAt ? new Date(expiresAt) : null;
        await existing.save();
        saved.push(existing);
      } else {
        const created = await AreaRisk.create({
          name,
          location: { type: "Point", coordinates: [longitude, latitude] },
          radiusMetres,
          baseRiskScore,
          riskFactors,
          timeProfile,
          source,
          confidence,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        });
        saved.push(created);
      }
    }

    return res.status(200).json({ success: true, count: saved.length, zones: saved });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to ingest official area risk" });
  }
};

const getNearbyAreaRisk = async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const radius = req.query.radius === undefined ? 2000 : Number(req.query.radius);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radius)) {
      return res.status(400).json({
        success: false,
        message: "latitude, longitude, and optional radius query params must be valid numbers",
      });
    }

    const zones = await findActiveAreaZones(latitude, longitude, Math.min(Math.max(radius, 50), 20000));
    return res.status(200).json({ success: true, count: zones.length, zones });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch area risk" });
  }
};

const updateAreaRisk = async (req, res) => {
  try {
    const allowed = ["name", "radiusMetres", "baseRiskScore", "riskFactors", "timeProfile", "confidence", "expiresAt"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const updated = await AreaRisk.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Area risk zone not found" });
    }
    return res.status(200).json({ success: true, areaRisk: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Failed to update area risk" });
  }
};

module.exports = {
  requireAdminKey,
  resolveCrowdExpiry,
  findActiveAreaZones,
  upsertAreaRisk,
  upsertOfficialAreaRisk,
  getNearbyAreaRisk,
  updateAreaRisk,
};
