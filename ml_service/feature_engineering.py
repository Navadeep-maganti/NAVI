"""Deterministic feature preparation shared by offline training and online inference."""

from __future__ import annotations

from datetime import datetime
from math import atan2, cos, pi, radians, sin, sqrt

from pydantic import BaseModel, ConfigDict, Field, field_validator


EARTH_RADIUS_METRES = 6_371_000
VISIT_RADIUS_METRES = 100


class LocationPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed: float = Field(ge=0, le=100)
    accuracy: float = Field(ge=0, le=1000)
    timestamp: datetime

    @field_validator("timestamp")
    @classmethod
    def timestamp_requires_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone, for example Z or +05:30")
        return value


class NormalizationParameter(BaseModel):
    mean: float
    scale: float = Field(gt=0)


class FeaturePreparationRequest(BaseModel):
    """Window should include prior samples and the current/latest sample."""

    model_config = ConfigDict(extra="forbid")
    locations: list[LocationPoint] = Field(min_length=1, max_length=10_000)
    normalization: dict[str, NormalizationParameter] | None = None


def distance_metres(first: LocationPoint, second: LocationPoint) -> float:
    latitude_delta = radians(second.latitude - first.latitude)
    longitude_delta = radians(second.longitude - first.longitude)
    a = sin(latitude_delta / 2) ** 2 + cos(radians(first.latitude)) * cos(
        radians(second.latitude)
    ) * sin(longitude_delta / 2) ** 2
    return 2 * EARTH_RADIUS_METRES * atan2(sqrt(a), sqrt(1 - a))


def bearing_degrees(first: LocationPoint, second: LocationPoint) -> float:
    longitude_delta = radians(second.longitude - first.longitude)
    first_latitude = radians(first.latitude)
    second_latitude = radians(second.latitude)
    y = sin(longitude_delta) * cos(second_latitude)
    x = cos(first_latitude) * sin(second_latitude) - sin(first_latitude) * cos(
        second_latitude
    ) * cos(longitude_delta)
    return (atan2(y, x) * 180 / pi + 360) % 360


def build_features(request: FeaturePreparationRequest) -> dict[str, dict[str, float] | None]:
    """Create stable raw features and optionally standardize with saved training statistics."""
    points = sorted(request.locations, key=lambda point: point.timestamp)
    current = points[-1]
    distances = [distance_metres(first, second) for first, second in zip(points, points[1:])]
    intervals = [
        (second.timestamp - first.timestamp).total_seconds()
        for first, second in zip(points, points[1:])
    ]
    total_distance = sum(distances)
    displacement = distance_metres(points[0], current) if len(points) > 1 else 0.0
    duration = max((current.timestamp - points[0].timestamp).total_seconds(), 0.0)
    direction = bearing_degrees(points[-2], current) if len(points) > 1 else 0.0
    nearby_visits = sum(
        distance_metres(point, current) <= VISIT_RADIUS_METRES for point in points
    )
    speeds = [point.speed for point in points]

    raw_features = {
        # Time features (timestamps are timezone-aware, preserving the user's local hour).
        "hour": float(current.timestamp.hour),
        "weekday": float(current.timestamp.weekday()),
        "is_weekend": float(current.timestamp.weekday() >= 5),
        # Spatial and movement features.
        "latitude": current.latitude,
        "longitude": current.longitude,
        "total_distance_metres": total_distance,
        "displacement_metres": displacement,
        "direction_degrees": direction,
        # Sine/cosine preserve the circular nature of compass direction for models.
        "direction_sin": sin(radians(direction)),
        "direction_cos": cos(radians(direction)),
        "current_speed_mps": current.speed,
        "mean_speed_mps": sum(speeds) / len(speeds),
        "max_speed_mps": max(speeds),
        "speed_change_mps": current.speed - points[-2].speed if len(points) > 1 else 0.0,
        # Temporal pattern and local visit-frequency features.
        "window_duration_seconds": duration,
        "point_count": float(len(points)),
        "mean_sample_interval_seconds": sum(intervals) / len(intervals) if intervals else 0.0,
        "visit_frequency_100m": float(nearby_visits),
        "current_accuracy_metres": current.accuracy,
    }

    normalized_features = None
    if request.normalization:
        normalized_features = {
            name: (value - request.normalization[name].mean) / request.normalization[name].scale
            for name, value in raw_features.items()
            if name in request.normalization
        }

    return {"rawFeatures": raw_features, "normalizedFeatures": normalized_features}
