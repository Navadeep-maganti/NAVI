"""Individual behavioural-profile learning using spatial DBSCAN clustering."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from sklearn.cluster import DBSCAN

from feature_engineering import EARTH_RADIUS_METRES, LocationPoint, distance_metres


DBSCAN_EPS_METRES = 100
DBSCAN_MIN_SAMPLES = 5
MIN_PROFILE_POINTS = 50
MIN_PROFILE_SPAN_DAYS = 7
MIN_CLUSTER_DISTINCT_DAYS = 2
MAX_ROUTE_GAP_SECONDS = 2 * 60 * 60
MAX_REPORTED_NOISE_POINTS = 200


class ExcludedWindow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start: datetime
    end: datetime


class AdaptiveLearnRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    locations: list[LocationPoint] = Field(min_length=1, max_length=10_000)
    previousProfile: dict | None = None
    excludedWindows: list[ExcludedWindow] = Field(default_factory=list, max_length=200)
    windowDays: int = Field(default=30, ge=7, le=90)
    adaptationRate: float = Field(default=0.35, gt=0.0, le=1.0)


def _top_values(counter: Counter, count: int = 3) -> list[int]:
    return [int(value) for value, _ in counter.most_common(count)]


def _cluster_boundary(cluster_points: list[LocationPoint], centroid: LocationPoint) -> dict:
    """Return a readable boundary without pretending DBSCAN clusters are circles."""
    distances = [distance_metres(point, centroid) for point in cluster_points]
    return {
        "boundingBox": {
            "minLatitude": min(point.latitude for point in cluster_points),
            "maxLatitude": max(point.latitude for point in cluster_points),
            "minLongitude": min(point.longitude for point in cluster_points),
            "maxLongitude": max(point.longitude for point in cluster_points),
        },
        "maxRadiusMetres": round(max(distances), 2),
        "radius95Metres": round(float(np.percentile(distances, 95)), 2),
    }


def learn_behavior_profile(locations: list[LocationPoint]) -> dict:
    """Find regular places with DBSCAN and learn repeat transitions and activity patterns."""
    points = sorted(locations, key=lambda point: point.timestamp)
    first_seen = points[0].timestamp
    last_seen = points[-1].timestamp
    span_days = (last_seen - first_seen).total_seconds() / 86_400
    sufficiency = {
        "minimumPoints": MIN_PROFILE_POINTS,
        "observedPoints": len(points),
        "minimumSpanDays": MIN_PROFILE_SPAN_DAYS,
        "observedSpanDays": round(span_days, 2),
    }

    if len(points) < MIN_PROFILE_POINTS or span_days < MIN_PROFILE_SPAN_DAYS:
        return {
            "isReady": False,
            "dataSufficiency": sufficiency,
            "regularPlaces": [],
            "routineRoutes": [],
            "activityPatterns": {},
        }

    # DBSCAN with metric='haversine' expects [latitude, longitude] in radians.
    coordinates = np.radians([[point.latitude, point.longitude] for point in points])
    labels = DBSCAN(
        eps=DBSCAN_EPS_METRES / EARTH_RADIUS_METRES,
        min_samples=DBSCAN_MIN_SAMPLES,
        metric="haversine",
        algorithm="ball_tree",
    ).fit_predict(coordinates)

    clusters: dict[int, list[LocationPoint]] = defaultdict(list)
    noise_points: list[LocationPoint] = []
    for point, label in zip(points, labels):
        if label >= 0:  # DBSCAN uses -1 for noise, which is deliberately not a regular place.
            clusters[int(label)].append(point)
        else:
            noise_points.append(point)

    regular_places = []
    for label, cluster_points in sorted(clusters.items()):
        hours = Counter(point.timestamp.hour for point in cluster_points)
        weekdays = Counter(point.timestamp.weekday() for point in cluster_points)
        centroid = LocationPoint(
            latitude=float(np.mean([point.latitude for point in cluster_points])),
            longitude=float(np.mean([point.longitude for point in cluster_points])),
            speed=0,
            accuracy=0,
            timestamp=cluster_points[-1].timestamp,
        )
        regular_places.append(
            {
                "clusterId": label,
                "latitude": centroid.latitude,
                "longitude": centroid.longitude,
                "visitCount": len(cluster_points),
                "peakHours": _top_values(hours),
                "peakWeekdays": _top_values(weekdays),
                "boundary": _cluster_boundary(cluster_points, centroid),
            }
        )

    route_counts: Counter = Counter()
    for index in range(1, len(points)):
        previous_label = int(labels[index - 1])
        current_label = int(labels[index])
        elapsed = (points[index].timestamp - points[index - 1].timestamp).total_seconds()
        if previous_label >= 0 and current_label >= 0 and previous_label != current_label and elapsed <= MAX_ROUTE_GAP_SECONDS:
            route_counts[(previous_label, current_label)] += 1

    routine_routes = [
        {"fromClusterId": start, "toClusterId": end, "transitionCount": count}
        for (start, end), count in route_counts.most_common()
    ]

    activity_patterns = {
        "hourlyActivity": {str(hour): count for hour, count in sorted(Counter(point.timestamp.hour for point in points).items())},
        "weekdayActivity": {str(day): count for day, count in sorted(Counter(point.timestamp.weekday() for point in points).items())},
        "peakHours": _top_values(Counter(point.timestamp.hour for point in points)),
        "peakWeekdays": _top_values(Counter(point.timestamp.weekday() for point in points)),
    }
    speeds = [point.speed for point in points]
    movement_baseline = {
        "meanSpeedMps": round(float(np.mean(speeds)), 3),
        "speed95Mps": round(float(np.percentile(speeds, 95)), 3),
        "maxSpeedMps": round(float(np.max(speeds)), 3),
    }
    unfamiliar_locations = [
        {
            "latitude": point.latitude,
            "longitude": point.longitude,
            "timestamp": point.timestamp.isoformat(),
            "accuracy": point.accuracy,
        }
        for point in noise_points[-MAX_REPORTED_NOISE_POINTS:]
    ]

    return {
        "isReady": True,
        "dataSufficiency": sufficiency,
        "regularPlaces": regular_places,
        "routineRoutes": routine_routes,
        "activityPatterns": activity_patterns,
        "movementBaseline": movement_baseline,
        "noiseSummary": {
            "count": len(noise_points),
            "percentage": round((len(noise_points) / len(points)) * 100, 2),
            "reportedPointLimit": MAX_REPORTED_NOISE_POINTS,
        },
        # Noise means no frequent-place cluster matched these samples; treat it
        # as unfamiliar, not automatically unsafe.
        "unfamiliarLocations": unfamiliar_locations,
        "learningConfig": {"algorithm": "DBSCAN", "epsMetres": DBSCAN_EPS_METRES, "minSamples": DBSCAN_MIN_SAMPLES},
        "firstSeen": first_seen.isoformat(),
        "lastSeen": last_seen.isoformat(),
    }


def _in_excluded_window(ts: datetime, windows: list[ExcludedWindow]) -> bool:
    return any(w.start <= ts <= w.end for w in windows)


def _blend_activity(prev_map: dict, curr_map: dict, alpha: float) -> dict[str, int]:
    keys = set(prev_map.keys()) | set(curr_map.keys())
    blended = {}
    for k in sorted(keys, key=lambda x: int(x) if str(x).isdigit() else str(x)):
        p = float(prev_map.get(str(k), 0))
        c = float(curr_map.get(str(k), 0))
        val = round((1.0 - alpha) * p + alpha * c)
        if val > 0:
            blended[str(k)] = int(val)
    return blended


def adapt_behavior_profile(request: AdaptiveLearnRequest) -> dict:
    """Rolling-window re-clustering that filters temporary anomalies and blends routines via EMA."""
    ordered = sorted(request.locations, key=lambda p: p.timestamp)
    cutoff = ordered[-1].timestamp - timedelta(days=request.windowDays)
    window_points = [p for p in ordered if p.timestamp >= cutoff]

    filtered_points = [
        p for p in window_points if not _in_excluded_window(p.timestamp, request.excludedWindows)
    ]
    excluded_count = len(window_points) - len(filtered_points)

    if not filtered_points:
        return {
            "isReady": False,
            "dataSufficiency": {
                "minimumPoints": MIN_PROFILE_POINTS,
                "observedPoints": 0,
                "minimumSpanDays": MIN_PROFILE_SPAN_DAYS,
                "observedSpanDays": 0.0,
            },
            "regularPlaces": [],
            "routineRoutes": [],
            "activityPatterns": {},
        }

    result = learn_behavior_profile(filtered_points)
    if not result.get("isReady"):
        return result

    # Require clusters to appear across at least 2 distinct calendar days so a single
    # temporary anomaly/linger never becomes a permanent regularPlace.
    coordinates = np.radians([[p.latitude, p.longitude] for p in filtered_points])
    labels = DBSCAN(
        eps=DBSCAN_EPS_METRES / EARTH_RADIUS_METRES,
        min_samples=DBSCAN_MIN_SAMPLES,
        metric="haversine",
        algorithm="ball_tree",
    ).fit_predict(coordinates)
    days_by_cluster: dict[int, set] = defaultdict(set)
    for point, label in zip(filtered_points, labels):
        if label >= 0:
            days_by_cluster[int(label)].add(point.timestamp.date())

    kept_places = []
    dropped_cluster_ids: set[int] = set()
    for place in result["regularPlaces"]:
        cid = place["clusterId"]
        distinct_days = len(days_by_cluster.get(cid, set()))
        if distinct_days >= MIN_CLUSTER_DISTINCT_DAYS:
            place["distinctDays"] = distinct_days
            kept_places.append(place)
        else:
            dropped_cluster_ids.add(cid)

    result["regularPlaces"] = kept_places
    result["routineRoutes"] = [
        r for r in result["routineRoutes"]
        if r["fromClusterId"] not in dropped_cluster_ids and r["toClusterId"] not in dropped_cluster_ids
    ]

    # Gradually adapt baselines with EMA when a previousProfile exists.
    prev = request.previousProfile
    alpha = request.adaptationRate
    if prev:
        prev_move = prev.get("movementBaseline") or {}
        curr_move = result["movementBaseline"]
        if prev_move.get("meanSpeedMps") is not None:
            curr_move["meanSpeedMps"] = round(
                (1.0 - alpha) * float(prev_move["meanSpeedMps"]) + alpha * curr_move["meanSpeedMps"], 3
            )
        if prev_move.get("speed95Mps") is not None:
            curr_move["speed95Mps"] = round(
                (1.0 - alpha) * float(prev_move["speed95Mps"]) + alpha * curr_move["speed95Mps"], 3
            )

        prev_act = prev.get("activityPatterns") or {}
        curr_act = result["activityPatterns"]
        if prev_act.get("hourlyActivity"):
            curr_act["hourlyActivity"] = _blend_activity(
                prev_act["hourlyActivity"], curr_act.get("hourlyActivity", {}), alpha
            )
        if prev_act.get("weekdayActivity"):
            curr_act["weekdayActivity"] = _blend_activity(
                prev_act["weekdayActivity"], curr_act.get("weekdayActivity", {}), alpha
            )

    result["adaptation"] = {
        "mode": "rolling-adaptive-ema",
        "windowDays": request.windowDays,
        "adaptationRate": alpha,
        "excludedAnomalyPoints": excluded_count,
        "singleDayClustersFiltered": len(dropped_cluster_ids),
    }
    return result
