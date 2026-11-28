"""Seed 30 days of realistic multi-region routine data around a target coordinate for a user."""

from __future__ import annotations

import argparse
import getpass
import random
import sys
from datetime import datetime, timedelta, timezone

from replay_real_data import get_token, http_json


def generate_routine_points(base_lat: float, base_lon: float, days: int = 29) -> list[dict]:
    rng = random.Random(42)
    now = datetime.now(timezone.utc)
    start_day = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

    # 5 distinct regions (each >1 km apart so DBSCAN eps=100m keeps them cleanly separated).
    places = {
        "home": (base_lat, base_lon),
        "work": (base_lat + 0.0120, base_lon + 0.0086),
        "market": (base_lat - 0.0088, base_lon - 0.0080),
        "gym": (base_lat + 0.0056, base_lon - 0.0115),
        "hub": (base_lat - 0.0138, base_lon + 0.0067),
    }

    points: list[dict] = []

    def add_stay(place_key: str, at: datetime, samples: int = 6, step_sec: int = 45) -> None:
        lat0, lon0 = places[place_key]
        for i in range(samples):
            ts = at + timedelta(seconds=i * step_sec)
            if ts >= now - timedelta(minutes=2):
                return
            points.append({
                "latitude": round(lat0 + rng.uniform(-0.00025, 0.00025), 6),
                "longitude": round(lon0 + rng.uniform(-0.00025, 0.00025), 6),
                "altitude": 14.0,
                "speed": round(rng.uniform(0.1, 1.1), 2),
                "accuracy": round(rng.uniform(6.0, 14.0), 1),
                "timestamp": ts.isoformat(),
            })

    def add_trip(from_key: str, to_key: str, start: datetime, duration_min: int = 15, steps: int = 4) -> None:
        lat1, lon1 = places[from_key]
        lat2, lon2 = places[to_key]
        for i in range(1, steps):
            frac = i / steps
            ts = start + timedelta(minutes=duration_min * frac)
            if ts >= now - timedelta(minutes=2):
                return
            points.append({
                "latitude": round(lat1 + (lat2 - lat1) * frac + rng.uniform(-0.0001, 0.0001), 6),
                "longitude": round(lon1 + (lon2 - lon1) * frac + rng.uniform(-0.0001, 0.0001), 6),
                "altitude": 14.0,
                "speed": round(rng.uniform(4.5, 9.5), 2),
                "accuracy": round(rng.uniform(8.0, 16.0), 1),
                "timestamp": ts.isoformat(),
            })

    for day_offset in range(days + 1):
        day = start_day + timedelta(days=day_offset)
        weekday = day.weekday()

        # Morning at Home -> Gym (4 days/week) -> Home
        add_stay("home", day + timedelta(hours=1, minutes=0))  # ~06:30 IST
        if weekday in (0, 2, 4, 5):
            add_trip("home", "gym", day + timedelta(hours=1, minutes=15), duration_min=12)
            add_stay("gym", day + timedelta(hours=1, minutes=30))
            add_trip("gym", "home", day + timedelta(hours=2, minutes=10), duration_min=12)
            add_stay("home", day + timedelta(hours=2, minutes=25))

        if weekday < 5:
            # Weekday commute: Home -> Work -> Market -> Home
            add_trip("home", "work", day + timedelta(hours=3, minutes=30), duration_min=18)
            add_stay("work", day + timedelta(hours=4, minutes=0), samples=8)
            add_trip("work", "market", day + timedelta(hours=11, minutes=30), duration_min=16)
            add_stay("market", day + timedelta(hours=12, minutes=0), samples=6)
            add_trip("market", "home", day + timedelta(hours=13, minutes=0), duration_min=14)
            add_stay("home", day + timedelta(hours=13, minutes=30), samples=7)
        else:
            # Weekend trip: Home -> Hub -> Market -> Home
            add_trip("home", "hub", day + timedelta(hours=5, minutes=0), duration_min=18)
            add_stay("hub", day + timedelta(hours=5, minutes=25), samples=6)
            add_trip("hub", "market", day + timedelta(hours=6, minutes=10), duration_min=15)
            add_stay("market", day + timedelta(hours=6, minutes=30), samples=6)
            add_trip("market", "home", day + timedelta(hours=7, minutes=20), duration_min=14)
            add_stay("home", day + timedelta(hours=8, minutes=0), samples=7)

    return points


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed 30-day realistic routine around coordinates.")
    parser.add_argument("--email", default="magantinavadeep@gmail.com")
    parser.add_argument("--password", default="")
    parser.add_argument("--lat", type=float, default=16.83326)
    parser.add_argument("--lon", type=float, default=81.52776)
    parser.add_argument("--reset-first", action="store_true", help="Clear existing locations first so past 29d points are not rejected as STALE_LOCATION")
    parser.add_argument("--backend-url", default="http://127.0.0.1:5000")
    args = parser.parse_args()

    password = args.password or getpass.getpass(f"Password for {args.email}: ")
    token = get_token(args.backend_url, args.email, password)

    if args.reset_first:
        del_status, del_res = http_json("DELETE", f"{args.backend_url}/api/privacy/location-data", token=token)
        print(f"Cleared existing location data (HTTP {del_status}): {del_res.get('deleted')}")

    points = generate_routine_points(args.lat, args.lon, days=29)
    print(f"Generated {len(points)} realistic points across 29 days around ({args.lat}, {args.lon}).")

    accepted, skipped = 0, 0
    for p in points:
        status, res = http_json("POST", f"{args.backend_url}/api/location/update", p, token=token)
        if status in (200, 201) and not res.get("skipped"):
            accepted += 1
        else:
            skipped += 1

    print(f"Uploaded to /api/location/update: accepted={accepted}, skipped={skipped}")

    status, learned = http_json("POST", f"{args.backend_url}/api/ml/behavior-profile/adapt?days=30", {}, token=token)
    profile = learned.get("profile") or {}
    places = profile.get("regularPlaces", [])
    routes = profile.get("routineRoutes", [])
    print(f"Adapt HTTP {status} | profileReady={learned.get('profileReady')} | regularPlaces={len(places)} | routineRoutes={len(routes)}")
    for r in routes[:10]:
        print(f"  Route: Place #{r['fromClusterId']} -> Place #{r['toClusterId']} ({r['transitionCount']}x)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
