"""Replay real GPS traces (.gpx, .csv, or GeoLife .plt) into NAVI and verify ML output."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

EARTH_RADIUS_M = 6_371_000


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_timestamp(raw: str) -> datetime:
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def load_gpx(path: Path) -> list[dict]:
    tree = ET.parse(path)
    root = tree.getroot()
    points = []
    for elem in root.iter():
        if not elem.tag.endswith("trkpt"):
            continue
        lat = float(elem.attrib["lat"])
        lon = float(elem.attrib["lon"])
        ele, ts = 0.0, None
        for child in elem:
            if child.tag.endswith("ele") and child.text:
                ele = float(child.text)
            elif child.tag.endswith("time") and child.text:
                ts = parse_timestamp(child.text)
        if ts is not None:
            points.append({"latitude": lat, "longitude": lon, "altitude": ele, "speed": None, "accuracy": 10.0, "ts": ts})
    return points


def parse_plt_lines(lines: list[str]) -> list[dict]:
    """Parse Microsoft GeoLife .plt trajectory lines (6 header lines)."""
    points = []
    for line in lines[6:]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 7:
            continue
        lat, lon = float(parts[0]), float(parts[1])
        alt_m = float(parts[3]) * 0.3048 if parts[3] != "-777" else 0.0
        ts = parse_timestamp(f"{parts[5]}T{parts[6]}+00:00")
        points.append({"latitude": lat, "longitude": lon, "altitude": alt_m, "speed": None, "accuracy": 12.0, "ts": ts})
    return points


def load_plt(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        return parse_plt_lines(f.readlines())


def load_csv(path: Path) -> list[dict]:
    points = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            norm = {k.strip().lower(): v.strip() for k, v in row.items() if k}
            lat = float(norm.get("latitude") or norm.get("lat"))
            lon = float(norm.get("longitude") or norm.get("lon") or norm.get("lng"))
            alt = float(norm.get("altitude") or norm.get("ele") or 0.0)
            spd_raw = norm.get("speed")
            spd = float(spd_raw) if spd_raw not in (None, "") else None
            acc = float(norm.get("accuracy") or 10.0)
            ts_raw = norm.get("timestamp") or norm.get("time") or norm.get("recordedat")
            if not ts_raw:
                continue
            points.append({"latitude": lat, "longitude": lon, "altitude": alt, "speed": spd, "accuracy": acc, "ts": parse_timestamp(ts_raw)})
    return points


def load_points(input_path: Path) -> list[dict]:
    loaders = {".gpx": load_gpx, ".plt": load_plt, ".csv": load_csv}
    all_points: list[dict] = []

    if input_path.exists():
        files = sorted(input_path.rglob("*")) if input_path.is_dir() else [input_path]
        for file in files:
            if file.is_file() and file.suffix.lower() in loaders:
                all_points.extend(loaders[file.suffix.lower()](file))
    else:
        # Support paths pointing inside an unextracted .zip archive (e.g. copied from Windows Explorer).
        parts = input_path.parts
        zip_idx = next((i for i, part in enumerate(parts) if part.lower().endswith(".zip")), None)
        if zip_idx is not None:
            zip_file = Path(*parts[: zip_idx + 1])
            inner_prefix = "/".join(parts[zip_idx + 1 :]).rstrip("/")
            if zip_file.is_file():
                with zipfile.ZipFile(zip_file, "r") as zf:
                    for name in sorted(zf.namelist()):
                        if inner_prefix and not name.startswith(inner_prefix):
                            continue
                        if name.lower().endswith(".plt"):
                            with zf.open(name) as f:
                                lines = f.read().decode("utf-8", errors="ignore").splitlines()
                                all_points.extend(parse_plt_lines(lines))

    all_points.sort(key=lambda p: p["ts"])
    return all_points


def prepare_points(points: list[dict], shift_to_now: bool, max_days: int, max_points: int) -> list[dict]:
    if not points:
        return []

    if shift_to_now:
        offset = (datetime.now(timezone.utc) - timedelta(minutes=5)) - points[-1]["ts"]
        for p in points:
            p["ts"] = p["ts"] + offset

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_days)
    points = [p for p in points if p["ts"] >= cutoff]

    if len(points) > max_points:
        step = len(points) / max_points
        points = [points[int(i * step)] for i in range(max_points)]

    # Fill missing speeds from consecutive points and clamp to backend's 55.56 m/s limit.
    for i, p in enumerate(points):
        if p["speed"] is None:
            if i == 0:
                p["speed"] = 0.0
            else:
                dt = max((p["ts"] - points[i - 1]["ts"]).total_seconds(), 1.0)
                dist = haversine_m(points[i - 1]["latitude"], points[i - 1]["longitude"], p["latitude"], p["longitude"])
                p["speed"] = min(round(dist / dt, 2), 55.0)
        p["speed"] = max(0.0, min(float(p["speed"]), 55.0))
        p["accuracy"] = max(0.0, min(float(p["accuracy"]), 100.0))
        p["timestamp"] = p["ts"].isoformat()
    return points


def http_json(method: str, url: str, payload: dict | None = None, token: str | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        try:
            return err.code, json.loads(body)
        except json.JSONDecodeError:
            return err.code, {"raw": body}


def get_token(backend_url: str, email: str, password: str) -> str:
    status, res = http_json("POST", f"{backend_url}/api/auth/login", {"email": email, "password": password})
    if status == 200 and res.get("token"):
        return res["token"]
    status, res = http_json(
        "POST",
        f"{backend_url}/api/auth/register",
        {"name": "RealData Tester", "email": email, "password": password},
    )
    if status in (200, 201) and res.get("token"):
        return res["token"]
    raise RuntimeError(f"Auth failed ({status}): {res}")


def print_profile_summary(profile: dict) -> None:
    places = profile.get("regularPlaces", [])
    routes = profile.get("routineRoutes", [])
    unfamiliar = profile.get("unfamiliarLocations", [])
    print(f"\n=== Learned Behavior Profile ===")
    print(f"Regular places (DBSCAN clusters): {len(places)}")
    for p in places[:10]:
        b = p.get("boundary", {})
        print(
            f"  - Cluster #{p['clusterId']}: ({p['latitude']:.5f}, {p['longitude']:.5f}) "
            f"| r95={b.get('radius95Metres', '?')}m, visits={p.get('visitCount', '?')}"
        )
    print(f"Routine routes: {len(routes)}")
    for r in routes[:10]:
        print(f"  - Cluster #{r['fromClusterId']} -> Cluster #{r['toClusterId']} ({r['transitionCount']}x)")
    print(f"Unfamiliar noise points (capped): {len(unfamiliar)}")


def run_probes(analyze_fn, sample_place: dict | None, fallback_point: dict) -> None:
    base_lat = sample_place["latitude"] if sample_place else fallback_point["latitude"]
    base_lon = sample_place["longitude"] if sample_place else fallback_point["longitude"]
    now_day = datetime.now(timezone.utc).replace(hour=14, minute=0, second=0, microsecond=0)
    odd_night = now_day.replace(hour=3)

    probes = [
        ("1. Normal (familiar place, daytime)", {"latitude": base_lat, "longitude": base_lon, "speed": 1.2, "accuracy": 10.0, "timestamp": now_day.isoformat()}),
        ("2. Unusual location (+2.2 km away)", {"latitude": base_lat + 0.02, "longitude": base_lon, "speed": 1.5, "accuracy": 10.0, "timestamp": now_day.isoformat()}),
        ("3. Unusual hour (familiar place, 03:00 UTC)", {"latitude": base_lat, "longitude": base_lon, "speed": 1.0, "accuracy": 10.0, "timestamp": odd_night.isoformat()}),
        ("4. High speed (30 m/s)", {"latitude": base_lat, "longitude": base_lon, "speed": 30.0, "accuracy": 12.0, "timestamp": now_day.isoformat()}),
    ]
    print("\n=== Anomaly Detection Probes ===")
    for label, pt in probes:
        status, res = analyze_fn(pt)
        analysis = res.get("analysis", res)
        signals = ", ".join(f"{s['type']}={s['score']}" for s in analysis.get("signals", []))
        print(
            f"  {label} -> HTTP {status} | score={analysis.get('deviationScore')} "
            f"level={analysis.get('deviationLevel')} anomalous={analysis.get('isAnomalous')} [{signals}]"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay real GPS data into NAVI and inspect ML behavior.")
    parser.add_argument("--input", required=True, type=Path, help="Path to .gpx, .csv, .plt file, or directory of traces")
    parser.add_argument("--backend-url", default="http://127.0.0.1:5000")
    parser.add_argument("--ml-url", default="http://127.0.0.1:8000")
    parser.add_argument("--ml-only", action="store_true", help="Call FastAPI ML service directly without backend/MongoDB")
    parser.add_argument("--email", default="realdata_test@example.com")
    parser.add_argument("--password", default="TestPass123!")
    parser.add_argument("--no-shift", action="store_true", help="Do not shift timestamps to end near now")
    parser.add_argument("--max-days", type=int, default=29, help="Keep points within last N days (backend limit is 30)")
    parser.add_argument("--max-points", type=int, default=1500, help="Downsample if trace exceeds N points")
    args = parser.parse_args()

    raw = load_points(args.input)
    points = prepare_points(raw, shift_to_now=not args.no_shift, max_days=args.max_days, max_points=args.max_points)
    if not points:
        print("No valid points found after loading/filtering.", file=sys.stderr)
        return 1

    span_days = (points[-1]["ts"] - points[0]["ts"]).total_seconds() / 86400
    print(f"Loaded {len(points)} points spanning {span_days:.2f} days.")

    if args.ml_only:
        ml_points = [
            {"latitude": p["latitude"], "longitude": p["longitude"], "speed": p["speed"], "accuracy": p["accuracy"], "timestamp": p["timestamp"]}
            for p in points
        ]
        status, learned = http_json("POST", f"{args.ml_url}/v1/behavior-profile/learn", {"locations": ml_points})
        print(f"ML learn HTTP {status} | isReady={learned.get('isReady')}")
        if not learned.get("isReady"):
            print(json.dumps(learned, indent=2))
            return 0
        print_profile_summary(learned)
        places = learned.get("regularPlaces", [])
        run_probes(
            lambda pt: http_json(
                "POST",
                f"{args.ml_url}/v1/behavior/analyze",
                {"currentLocation": pt, "recentLocations": ml_points[-5:], "profile": learned},
            ),
            places[0] if places else None,
            points[-1],
        )
        return 0

    token = get_token(args.backend_url, args.email, args.password)
    accepted, skipped = 0, 0
    for p in points:
        body = {
            "latitude": p["latitude"],
            "longitude": p["longitude"],
            "altitude": p["altitude"],
            "speed": p["speed"],
            "accuracy": p["accuracy"],
            "timestamp": p["timestamp"],
        }
        status, res = http_json("POST", f"{args.backend_url}/api/location/update", body, token=token)
        if status in (200, 201) and not res.get("skipped"):
            accepted += 1
        else:
            skipped += 1
    print(f"Uploaded to /api/location/update: accepted={accepted}, skipped/deduped={skipped}")

    status, learned = http_json("POST", f"{args.backend_url}/api/ml/behavior-profile/learn?days=30", {}, token=token)
    print(f"Learn profile HTTP {status} | profileReady={learned.get('profileReady')}")
    if not learned.get("profileReady"):
        print(json.dumps(learned, indent=2))
        return 0

    profile = learned["profile"]
    print_profile_summary(profile)
    places = profile.get("regularPlaces", [])
    run_probes(
        lambda pt: http_json("POST", f"{args.backend_url}/api/ml/behavior/analyze", pt, token=token),
        places[0] if places else None,
        points[-1],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

