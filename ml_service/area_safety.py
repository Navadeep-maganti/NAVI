"""Area safety scoring combining spatial-temporal environmental risk with personal behavior."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from behavioral_anomaly import (
    AnomalyRequest,
    BehaviorProfileInput,
    _clamp,
    detect_behavior_anomaly,
)
from feature_engineering import LocationPoint, distance_metres


class TimeProfileInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dayMultiplier: float = Field(default=0.85, ge=0, le=2)
    nightMultiplier: float = Field(default=1.3, ge=0, le=2)
    weekendMultiplier: float = Field(default=1.0, ge=0, le=2)


class AreaZoneInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str | None = None
    name: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radiusMetres: float = Field(default=300.0, gt=0)
    baseRiskScore: float = Field(ge=0, le=1)
    riskFactors: list[str] = Field(default_factory=list)
    timeProfile: TimeProfileInput = Field(default_factory=TimeProfileInput)
    confidence: float = Field(default=0.8, ge=0, le=1)


class AreaSafetyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    currentLocation: LocationPoint
    recentLocations: list[LocationPoint] = Field(default_factory=list, max_length=100)
    areaZones: list[AreaZoneInput] = Field(default_factory=list, max_length=50)
    profile: BehaviorProfileInput | None = None


def _risk_level(score: float) -> str:
    if score >= 0.65:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def score_environmental_risk(current: LocationPoint, zones: list[AreaZoneInput]) -> dict:
    hour = current.timestamp.hour
    weekday = current.timestamp.weekday()
    is_night = hour >= 22 or hour < 5
    is_weekend = weekday >= 5

    matched_zones = []
    factors: set[str] = set()
    no_hazard_prob = 1.0
    safe_hub_mitigation = 0.0

    for zone in zones:
        dist = distance_metres(current, zone)
        if dist <= zone.radiusMetres:
            spatial_weight = 1.0
        elif dist <= zone.radiusMetres * 2:
            spatial_weight = 1.0 - (dist - zone.radiusMetres) / zone.radiusMetres
        else:
            continue

        time_mult = zone.timeProfile.nightMultiplier if is_night else zone.timeProfile.dayMultiplier
        if is_weekend:
            time_mult *= zone.timeProfile.weekendMultiplier

        is_safe_hub = "safe_hub" in zone.riskFactors and zone.baseRiskScore <= 0.1
        if is_safe_hub:
            mitigation = 0.15 * spatial_weight * zone.confidence
            safe_hub_mitigation = max(safe_hub_mitigation, mitigation)
            effective = 0.0
        else:
            effective = _clamp(zone.baseRiskScore * time_mult * spatial_weight * zone.confidence)
            no_hazard_prob *= 1.0 - effective

        factors.update(zone.riskFactors)
        matched_zones.append({
            "id": zone.id,
            "name": zone.name,
            "distanceMetres": round(dist, 2),
            "spatialWeight": round(spatial_weight, 3),
            "timeMultiplier": round(time_mult, 3),
            "effectiveRisk": effective,
            "riskFactors": zone.riskFactors,
        })

    zone_score = 1.0 - no_hazard_prob
    baseline_context = 0.0
    if is_night:
        baseline_context += 0.1
        factors.add("late_night")
    if current.accuracy > 50:
        baseline_context += 0.1
        factors.add("low_gps_confidence")

    raw_env = max(zone_score, baseline_context) + (0.05 if zone_score > 0 and is_night else 0.0)
    env_score = _clamp(raw_env - safe_hub_mitigation)
    return {
        "score": env_score,
        "level": _risk_level(env_score),
        "timeContext": {"hour": hour, "weekday": weekday, "isNight": is_night, "isWeekend": is_weekend},
        "matchedZones": sorted(matched_zones, key=lambda z: z["effectiveRisk"], reverse=True),
        "factors": sorted(factors),
    }


def assess_area_safety(request: AreaSafetyRequest) -> dict:
    env = score_environmental_risk(request.currentLocation, request.areaZones)
    env_score = env["score"]

    if request.profile is None:
        return {
            "overallSafetyRisk": env_score,
            "riskLevel": _risk_level(env_score),
            "environmentalRisk": env,
            "behavioralRisk": None,
            "hasPersonalProfile": False,
            "modelVersion": "area-safety-v1",
        }

    behavioral = detect_behavior_anomaly(
        AnomalyRequest(
            currentLocation=request.currentLocation,
            recentLocations=request.recentLocations,
            profile=request.profile,
        )
    )
    beh_score = behavioral["deviationScore"]
    location_signal = next(
        (s["score"] for s in behavioral.get("signals", []) if s["type"] == "unusualLocation"),
        0.0,
    )

    combined = 0.55 * env_score + 0.45 * beh_score
    if location_signal > 0.3 and env_score >= 0.4:
        combined += 0.08
    elif location_signal == 0.0 and beh_score < 0.25:
        combined *= 0.85

    overall = _clamp(combined)
    return {
        "overallSafetyRisk": overall,
        "riskLevel": _risk_level(overall),
        "environmentalRisk": env,
        "behavioralRisk": behavioral,
        "hasPersonalProfile": True,
        "modelVersion": "area-safety-v1",
    }

