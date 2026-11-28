const User = require("../models/User");
const Location = require("../models/Location");
const { learnTravelProfile } = require("./mlService");
const { formatLocalIso } = require("../utils/time");

const TRAVEL_TRIGGER_METRES = 25_000; // 25 km outside all home regularPlaces
const RETURN_HOME_METRES = 5_000; // Within 5 km of any home regularPlace ends travel mode
const PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours between travel prompts
const EARTH_RADIUS_METRES = 6_371_000;

const distanceMetres = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const nearestHomeDistanceMetres = (currentLocation, homeProfile) => {
  const places = homeProfile?.regularPlaces || [];
  if (!places.length) return null;
  let minDist = Infinity;
  for (const p of places) {
    const d = distanceMetres(currentLocation, p);
    if (d < minDist) minDist = d;
  }
  return minDist;
};

const evaluateTravelState = ({ currentLocation, homeProfile, travelMode = {}, now = new Date() }) => {
  const nearestDist = nearestHomeDistanceMetres(currentLocation, homeProfile);
  if (nearestDist === null) {
    return { action: "none", nearestHomeMetres: null };
  }

  if (travelMode.active) {
    if (nearestDist <= RETURN_HOME_METRES) {
      return { action: "auto_return_home", nearestHomeMetres: Math.round(nearestDist) };
    }
    return { action: "none", nearestHomeMetres: Math.round(nearestDist) };
  }

  if (nearestDist > TRAVEL_TRIGGER_METRES) {
    const lastPrompt = travelMode.lastPromptedAt ? new Date(travelMode.lastPromptedAt).getTime() : 0;
    const dismissedUntil = travelMode.dismissedUntil ? new Date(travelMode.dismissedUntil).getTime() : 0;
    const nowMs = now.getTime();
    if (nowMs - lastPrompt > PROMPT_COOLDOWN_MS && nowMs > dismissedUntil) {
      return {
        action: "prompt_travel",
        nearestHomeMetres: Math.round(nearestDist),
        distanceKm: Number((nearestDist / 1000).toFixed(1)),
      };
    }
  }

  return { action: "none", nearestHomeMetres: Math.round(nearestDist) };
};

const confirmTravelMode = async (userId, traveling) => {
  const now = new Date();
  if (traveling) {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "travelMode.active": true,
          "travelMode.mode": "roaming",
          "travelMode.startedAt": now,
          "travelMode.dismissedUntil": null,
          "travelMode.temporaryProfile": null,
        },
      },
      { new: true }
    )
      .select("travelMode")
      .lean();
  }

  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "travelMode.active": false,
        "travelMode.mode": "roaming",
        "travelMode.dismissedUntil": new Date(now.getTime() + PROMPT_COOLDOWN_MS),
        "travelMode.temporaryProfile": null,
      },
    },
    { new: true }
  )
    .select("travelMode")
    .lean();
};

const maybeRefreshTravelProfile = async (userId, travelMode) => {
  if (!travelMode?.active || !travelMode?.startedAt) return travelMode;

  const tripLocations = await Location.find({
    user: userId,
    recordedAt: { $gte: new Date(travelMode.startedAt) },
  })
    .select("latitude longitude speed accuracy recordedAt timezoneOffsetMinutes")
    .sort({ recordedAt: 1 })
    .limit(2000)
    .lean();

  if (tripLocations.length < 12) return travelMode;

  try {
    const learned = await learnTravelProfile(
      tripLocations.map((pt) => ({
        latitude: pt.latitude,
        longitude: pt.longitude,
        speed: pt.speed,
        accuracy: pt.accuracy,
        timestamp: formatLocalIso(pt.recordedAt, pt.timezoneOffsetMinutes || 0),
      }))
    );

    if (learned?.hasPattern) {
      const updated = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            "travelMode.mode": "local_pattern",
            "travelMode.temporaryProfile": learned,
          },
        },
        { new: true }
      )
        .select("travelMode")
        .lean();
      return updated?.travelMode || travelMode;
    }
  } catch {
    // Keep roaming mode if travel-learn fails.
  }
  return travelMode;
};

module.exports = {
  TRAVEL_TRIGGER_METRES,
  RETURN_HOME_METRES,
  evaluateTravelState,
  confirmTravelMode,
  maybeRefreshTravelProfile,
};
