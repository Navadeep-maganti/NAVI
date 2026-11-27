"""Evaluate SafeCity ML clustering, anomaly detection, and false-positive rate."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml_service"))

from area_safety import AreaSafetyRequest, AreaZoneInput, assess_area_safety
from behavioral_anomaly import BehaviorProfileInput
from behavioral_learning import AdaptiveLearnRequest, adapt_behavior_profile
from feature_engineering import LocationPoint


def build_synthetic_routine() -> list[LocationPoint]:
    """Generate 10 days of home (40.000, 116.320) <-> work (40.015, 116.335) routine."""
    base = datetime(2026, 11, 18, 8, 0, tzinfo=timezone.utc)
    points: list[LocationPoint] = []
    for day in range(10):
        d = base + timedelta(days=day)
        for m in range(6):
            points.append(
                LocationPoint(
                    latitude=40.0000 + m * 0.00005,
                    longitude=116.3200 + m * 0.00005,
                    speed=0.5,
                    accuracy=8.0,
                    timestamp=d + timedelta(minutes=m * 5),
                )
            )
            points.append(
                LocationPoint(
                    latitude=40.0150 + m * 0.00005,
                    longitude=116.3350 + m * 0.00005,
                    speed=1.0,
                    accuracy=8.0,
                    timestamp=d + timedelta(hours=2, minutes=m * 5),
                )
            )
    # Inject a 1-day temporary anomaly linger (should be filtered out by distinctDays >= 2).
    for m in range(6):
        points.append(
            LocationPoint(
                latitude=40.0500,
                longitude=116.3800,
                speed=0.4,
                accuracy=10.0,
                timestamp=base + timedelta(days=5, hours=14, minutes=m * 2),
            )
        )
    return points


def main() -> int:
    points = build_synthetic_routine()
    profile_dict = adapt_behavior_profile(AdaptiveLearnRequest(locations=points, windowDays=30))
    assert profile_dict["isReady"], "Expected synthetic routine to produce a ready profile"
    print(
        f"Profile ready: {len(profile_dict['regularPlaces'])} regularPlaces, "
        f"singleDayClustersFiltered={profile_dict['adaptation']['singleDayClustersFiltered']}"
    )

    profile = BehaviorProfileInput(**profile_dict)
    dark_zone = AreaZoneInput(
        id="z1",
        name="Unlit Alley",
        latitude=40.045,
        longitude=116.375,
        radiusMetres=350,
        baseRiskScore=0.8,
        riskFactors=["poor_lighting"],
    )
    safe_hub = AreaZoneInput(
        id="h1",
        name="City Police Station",
        latitude=40.0001,
        longitude=116.3201,
        radiusMetres=300,
        baseRiskScore=0.0,
        riskFactors=["safe_hub", "police"],
    )

    # Labeled evaluation cases: (label_is_risky, name, request)
    cases = [
        (
            False,
            "Normal home daytime",
            AreaSafetyRequest(
                currentLocation=LocationPoint(latitude=40.0001, longitude=116.3201, speed=0.8, accuracy=8, timestamp="2026-11-28T08:10:00Z"),
                areaZones=[safe_hub],
                profile=profile,
            ),
        ),
        (
            False,
            "Normal work daytime",
            AreaSafetyRequest(
                currentLocation=LocationPoint(latitude=40.0151, longitude=116.3351, speed=1.0, accuracy=9, timestamp="2026-11-28T10:10:00Z"),
                areaZones=[],
                profile=profile,
            ),
        ),
        (
            False,
            "Familiar home at night near safe hub",
            AreaSafetyRequest(
                currentLocation=LocationPoint(latitude=40.0001, longitude=116.3201, speed=0.2, accuracy=8, timestamp="2026-11-28T23:30:00Z"),
                areaZones=[safe_hub],
                profile=profile,
            ),
        ),
        (
            True,
            "Unfamiliar unlit zone at night",
            AreaSafetyRequest(
                currentLocation=LocationPoint(latitude=40.045, longitude=116.375, speed=1.2, accuracy=12, timestamp="2026-11-28T23:30:00Z"),
                areaZones=[dark_zone],
                profile=profile,
            ),
        ),
        (
            True,
            "Unfamiliar unlit zone + abnormal speed",
            AreaSafetyRequest(
                currentLocation=LocationPoint(latitude=40.045, longitude=116.375, speed=28.0, accuracy=15, timestamp="2026-11-28T23:45:00Z"),
                areaZones=[dark_zone],
                profile=profile,
            ),
        ),
    ]

    tp = fp = tn = fn = 0
    print("\n=== ML Evaluation & False-Positive Analysis ===")
    for expected_risky, name, req in cases:
        res = assess_area_safety(req)
        predicted_risky = res["overallSafetyRisk"] >= 0.35
        if expected_risky and predicted_risky:
            tp += 1
        elif not expected_risky and predicted_risky:
            fp += 1
        elif not expected_risky and not predicted_risky:
            tn += 1
        else:
            fn += 1
        print(
            f"  {name:<40} | expected={'RISKY' if expected_risky else 'SAFE ':5} "
            f"| pred={res['riskLevel']:<6} ({res['overallSafetyRisk']:.3f})"
        )

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else 0.0
    print(f"\nPrecision={precision:.2f} | Recall={recall:.2f} | False-Positive Rate={fpr:.2%}")
    return 0 if fp == 0 and fn == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

