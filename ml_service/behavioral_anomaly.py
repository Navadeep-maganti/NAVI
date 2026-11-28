"""Profile-based behavioural deviation scoring for a current location sample."""

from math import isfinite

from pydantic import BaseModel, ConfigDict, Field

from feature_engineering import LocationPoint, distance_metres


class RegularPlace(BaseModel):
    model_config = ConfigDict(extra="ignore")
    clusterId: int
    latitude: float
    longitude: float
    boundary: dict = {}


class RoutineRoute(BaseModel):
    model_config = ConfigDict(extra="ignore")
    fromClusterId: int
    toClusterId: int
    transitionCount: int


class BehaviorProfileInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    regularPlaces: list[RegularPlace]
    routineRoutes: list[RoutineRoute] = []
    activityPatterns: dict = {}
    movementBaseline: dict = {}


class AnomalyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    currentLocation: LocationPoint
    recentLocations: list[LocationPoint] = Field(default_factory=list, max_length=100)
    profile: BehaviorProfileInput


def _clamp(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 3)


def _place_distance(point: LocationPoint, place: RegularPlace) -> float:
    # distance_metres only reads latitude and longitude, so LocationPoint is not needed for the centroid.
    return distance_metres(point, place)


def _nearest_place(point: LocationPoint, places: list[RegularPlace]) -> tuple[RegularPlace | None, float]:
    if not places:
        return None, float("inf")
    place = min(places, key=lambda candidate: _place_distance(point, candidate))
    return place, _place_distance(point, place)


MAX_FAMILIAR_RADIUS_METRES = 250.0


def _place_radius(place: RegularPlace) -> float:
    boundary = place.boundary or {}
    radius = boundary.get("radius95Metres", boundary.get("maxRadiusMetres", 100))
    return max(100.0, min(float(radius), MAX_FAMILIAR_RADIUS_METRES))


def _cluster_id_if_familiar(point: LocationPoint, places: list[RegularPlace]) -> int | None:
    place, distance = _nearest_place(point, places)
    return place.clusterId if place and distance <= _place_radius(place) else None


def detect_behavior_anomaly(request: AnomalyRequest) -> dict:
    current = request.currentLocation
    profile = request.profile
    weighted_signals: list[tuple[str, float, float, dict]] = []

    # 1. Location novelty: distance beyond a learned DBSCAN cluster boundary.
    nearest, distance = _nearest_place(current, profile.regularPlaces)
    if nearest:
        boundary = _place_radius(nearest)
        location_score = _clamp((distance - boundary) / 1000)
        weighted_signals.append(("unusualLocation", location_score, 0.35, {
            "nearestClusterId": nearest.clusterId,
            "distanceFromNearestPlaceMetres": round(distance, 2),
            "clusterBoundaryMetres": round(boundary, 2),
        }))

    # 2. Time novelty: low-frequency hour/day combinations are deviations, not proof of danger.
    patterns = profile.activityPatterns or {}
    hourly = patterns.get("hourlyActivity", {})
    weekdays = patterns.get("weekdayActivity", {})
    if hourly and weekdays:
        hour_count = float(hourly.get(str(current.timestamp.hour), 0))
        weekday_count = float(weekdays.get(str(current.timestamp.weekday()), 0))
        expectedness = 0.5 * (
            hour_count / max(map(float, hourly.values()))
            + weekday_count / max(map(float, weekdays.values()))
        )
        weighted_signals.append(("unusualTravelTime", _clamp(1 - expectedness), 0.2, {
            "hour": current.timestamp.hour,
            "weekday": current.timestamp.weekday(),
            "hourObservations": int(hour_count),
            "weekdayObservations": int(weekday_count),
        }))

    # 3. Route novelty: an unfamiliar transition between two known regular places.
    current_cluster = _cluster_id_if_familiar(current, profile.regularPlaces)
    previous_cluster = (
        _cluster_id_if_familiar(request.recentLocations[-1], profile.regularPlaces)
        if request.recentLocations else None
    )
    if previous_cluster is not None and current_cluster is not None and previous_cluster != current_cluster:
        matching_route = next((route for route in profile.routineRoutes
                               if route.fromClusterId == previous_cluster and route.toClusterId == current_cluster), None)
        weighted_signals.append(("unusualRoute", 0.0 if matching_route else 1.0, 0.25, {
            "fromClusterId": previous_cluster,
            "toClusterId": current_cluster,
            "knownTransitionCount": matching_route.transitionCount if matching_route else 0,
        }))

    # 4. Movement novelty: compare the observed speed with the user's learned 95th percentile.
    speed95 = float((profile.movementBaseline or {}).get("speed95Mps", 0))
    if isfinite(speed95) and speed95 > 0:
        movement_score = _clamp((current.speed - speed95) / speed95)
        weighted_signals.append(("abnormalMovement", movement_score, 0.2, {
            "currentSpeedMps": current.speed,
            "normalSpeed95Mps": speed95,
        }))

    total_weight = sum(weight for _, _, weight, _ in weighted_signals)
    deviation_score = _clamp(
        sum(score * weight for _, score, weight, _ in weighted_signals) / total_weight
    ) if total_weight else 0.0
    level = "high" if deviation_score >= 0.65 else "elevated" if deviation_score >= 0.35 else "normal"

    return {
        "deviationScore": deviation_score,
        "deviationLevel": level,
        "isAnomalous": deviation_score >= 0.5,
        "signals": [
            {"type": signal_type, "score": score, "details": details}
            for signal_type, score, _, details in weighted_signals
        ],
        "modelVersion": "behavioral-deviation-v1",
    }
