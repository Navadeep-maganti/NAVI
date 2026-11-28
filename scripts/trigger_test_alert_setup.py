"""Shift a user's learned routine away from their current GPS and seed a hazard zone to test live alerts."""

from __future__ import annotations

import argparse
import getpass
import os

from replay_real_data import get_token, http_json
from seed_personal_routine import generate_routine_points


def main() -> int:
    parser = argparse.ArgumentParser(description="Set up live alert trigger condition for a user's current GPS.")
    parser.add_argument("--email", default="magantinavadeep@gmail.com")
    parser.add_argument("--password", default="")
    parser.add_argument("--current-lat", type=float, default=16.83334)
    parser.add_argument("--current-lon", type=float, default=81.52774)
    parser.add_argument("--admin-key", default=os.getenv("ADMIN_API_KEY", "your-secret-key"))
    parser.add_argument("--backend-url", default="http://127.0.0.1:5000")
    args = parser.parse_args()

    password = args.password or getpass.getpass(f"Password for {args.email}: ")
    token = get_token(args.backend_url, args.email, password)

    # 1. Clear old points and seed 29-day routine ~3 km away so current GPS is unfamiliar.
    http_json("DELETE", f"{args.backend_url}/api/privacy/location-data", token=token)
    remote_lat = args.current_lat + 0.022
    remote_lon = args.current_lon + 0.018
    points = generate_routine_points(remote_lat, remote_lon, days=29)

    accepted = 0
    for p in points:
        status, res = http_json("POST", f"{args.backend_url}/api/location/update", p, token=token)
        if status in (200, 201) and not res.get("skipped"):
            accepted += 1

    _, learned = http_json("POST", f"{args.backend_url}/api/ml/behavior-profile/adapt?days=30", {}, token=token)
    print(f"Seeded remote routine ({accepted} pts) | profileReady={learned.get('profileReady')}")

    # 2. Ensure preferences allow unknown-area alerts with high sensitivity.
    http_json(
        "POST",
        f"{args.backend_url}/api/preferences",
        {
            "lateNightThreshold": 22,
            "enableUnknownAreaAlerts": True,
            "deviationSensitivity": 1.0,
            "autoAlertTrustedContacts": True,
        },
        token=token,
    )

    # 3. Seed a high-risk AreaRisk zone right at the user's current location.
    import json
    import urllib.request

    req = urllib.request.Request(
        f"{args.backend_url}/api/area-risk/official",
        data=json.dumps({
            "name": "Test High-Risk Zone",
            "latitude": args.current_lat,
            "longitude": args.current_lon,
            "radiusMetres": 400,
            "baseRiskScore": 0.9,
            "riskFactors": ["poor_lighting", "incident_hotspot"],
            "source": "seeded",
            "confidence": 0.95,
        }).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Admin-Key": args.admin_key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"Seeded high-risk zone at ({args.current_lat}, {args.current_lon}) -> HTTP {resp.status}")

    print("\nNow tap 'Refresh' on your Dashboard or 'Ping GPS' on Live Map to trigger the live Safety Check-In!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
