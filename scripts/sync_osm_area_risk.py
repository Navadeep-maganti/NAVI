"""Sync objective area-safety zones from OpenStreetMap (Overpass API) into SafeCity."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def fetch_overpass(lat: float, lon: float, radius: int) -> dict:
    query = f"""
    [out:json][timeout:25];
    (
      way["lit"="no"](around:{radius},{lat},{lon});
      node["amenity"~"^(police|hospital)$"](around:{radius},{lat},{lon});
      node["public_transport"="station"](around:{radius},{lat},{lon});
    );
    out center 150;
    """
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def osm_to_zones(osm_data: dict) -> list[dict]:
    zones: list[dict] = []
    seen_grid: set[tuple[int, int, str]] = set()

    for elem in osm_data.get("elements", []):
        tags = elem.get("tags", {})
        center = elem.get("center") or elem
        lat = center.get("lat")
        lon = center.get("lon")
        if lat is None or lon is None:
            continue

        # Coarse ~100m grid dedup so long unlit roads don't create dozens of identical zones.
        grid = (round(lat * 1000), round(lon * 1000))

        if tags.get("lit") == "no":
            key = (*grid, "unlit")
            if key in seen_grid:
                continue
            seen_grid.add(key)
            zones.append({
                "name": tags.get("name") or "Unlit street/path (OSM)",
                "latitude": float(lat),
                "longitude": float(lon),
                "radiusMetres": 200,
                "baseRiskScore": 0.6,
                "riskFactors": ["poor_lighting"],
                "timeProfile": {"dayMultiplier": 0.45, "nightMultiplier": 1.4, "weekendMultiplier": 1.0},
                "source": "official_feed",
                "confidence": 0.85,
            })
        elif tags.get("amenity") in ("police", "hospital") or tags.get("public_transport") == "station":
            kind = tags.get("amenity") or "transit_station"
            key = (*grid, kind)
            if key in seen_grid:
                continue
            seen_grid.add(key)
            zones.append({
                "name": tags.get("name") or f"Safe hub ({kind})",
                "latitude": float(lat),
                "longitude": float(lon),
                "radiusMetres": 250,
                "baseRiskScore": 0.0,
                "riskFactors": ["safe_hub", kind],
                "timeProfile": {"dayMultiplier": 1.0, "nightMultiplier": 1.0, "weekendMultiplier": 1.0},
                "source": "official_feed",
                "confidence": 0.9,
            })

    return zones[:200]


def main() -> int:
    parser = argparse.ArgumentParser(description="Import real OSM lighting and safe-hub data into /api/area-risk/official.")
    parser.add_argument("--lat", required=True, type=float)
    parser.add_argument("--lon", required=True, type=float)
    parser.add_argument("--radius", type=int, default=2000, help="Search radius in metres (default: 2000)")
    parser.add_argument("--backend-url", default="http://127.0.0.1:5000")
    parser.add_argument("--admin-key", default=os.getenv("ADMIN_API_KEY", ""))
    parser.add_argument("--dry-run", action="store_true", help="Print zones without uploading to backend")
    args = parser.parse_args()

    osm_data = fetch_overpass(args.lat, args.lon, args.radius)
    zones = osm_to_zones(osm_data)
    print(f"Fetched {len(zones)} area-safety zones from OpenStreetMap around ({args.lat}, {args.lon}).")

    if args.dry_run or not zones:
        print(json.dumps(zones[:5], indent=2))
        return 0

    if not args.admin_key:
        print("Missing --admin-key (or ADMIN_API_KEY env var).", file=sys.stderr)
        return 1

    req = urllib.request.Request(
        f"{args.backend_url}/api/area-risk/official",
        data=json.dumps({"zones": zones}).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Admin-Key": args.admin_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            print(f"Synced {result.get('count')} official zones to backend.")
    except urllib.error.HTTPError as err:
        print(f"Backend error {err.code}: {err.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

