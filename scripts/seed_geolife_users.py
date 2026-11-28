"""Batch-seed multiple GeoLife user trajectories from a zip/folder into NAVI user accounts."""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

from replay_real_data import get_token, http_json, load_points, prepare_points


def discover_geolife_users(archive_or_dir: Path, prefix: str, limit: int) -> list[str]:
    users: set[str] = set()
    if archive_or_dir.is_file() and archive_or_dir.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive_or_dir, "r") as zf:
            for name in zf.namelist():
                if not name.startswith(prefix):
                    continue
                rest = name[len(prefix) :].lstrip("/")
                parts = rest.split("/")
                if len(parts) >= 2 and parts[1] == "Trajectory" and parts[0].isdigit():
                    users.add(parts[0])
    elif archive_or_dir.is_dir():
        data_dir = archive_or_dir / prefix
        if data_dir.is_dir():
            for child in sorted(data_dir.iterdir()):
                if child.is_dir() and (child / "Trajectory").is_dir():
                    users.add(child.name)
    return sorted(users)[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed multiple GeoLife users into NAVI.")
    parser.add_argument(
        "--archive",
        required=True,
        type=Path,
        help="Path to archive (3).zip or extracted Geolife folder",
    )
    parser.add_argument(
        "--data-prefix",
        default="Geolife Trajectories 1.3/Geolife Trajectories 1.3/Data/",
        help="Inner path to Data/ inside the archive",
    )
    parser.add_argument("--users", default="", help="Comma-separated user IDs (e.g. 000,001,002)")
    parser.add_argument("--count", type=int, default=5, help="Number of users to seed if --users is omitted")
    parser.add_argument("--max-points", type=int, default=600, help="Max points per user (default: 600)")
    parser.add_argument("--backend-url", default="http://127.0.0.1:5000")
    parser.add_argument("--password", default="NaviTest123!")
    args = parser.parse_args()

    prefix = args.data_prefix.rstrip("/") + "/"
    user_ids = (
        [u.strip() for u in args.users.split(",") if u.strip()]
        if args.users.strip()
        else discover_geolife_users(args.archive, prefix, args.count)
    )
    if not user_ids:
        print("No GeoLife user folders found. Check --archive and --data-prefix.", file=sys.stderr)
        return 1

    print(f"Seeding {len(user_ids)} user(s): {', '.join(user_ids)}\n")
    for uid in user_ids:
        email = f"geolife_{uid}@navi.test"
        traj_path = args.archive / prefix.strip("/") / uid / "Trajectory"
        raw = load_points(traj_path)
        points = prepare_points(raw, shift_to_now=True, max_days=29, max_points=args.max_points)
        if not points:
            print(f"[{uid}] skipped (no points)")
            continue

        token = get_token(args.backend_url, email, args.password)
        accepted = 0
        for p in points:
            status, res = http_json(
                "POST",
                f"{args.backend_url}/api/location/update",
                {
                    "latitude": p["latitude"],
                    "longitude": p["longitude"],
                    "altitude": p["altitude"],
                    "speed": p["speed"],
                    "accuracy": p["accuracy"],
                    "timestamp": p["timestamp"],
                },
                token=token,
            )
            if status in (200, 201) and not res.get("skipped"):
                accepted += 1

        _, learned = http_json(
            "POST",
            f"{args.backend_url}/api/ml/behavior-profile/adapt?days=30",
            {},
            token=token,
        )
        profile = learned.get("profile") or {}
        places = len(profile.get("regularPlaces", []))
        routes = len(profile.get("routineRoutes", []))
        print(
            f"[{uid}] {email} / {args.password} | accepted={accepted} | "
            f"profileReady={learned.get('profileReady')} | places={places} | routes={routes}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
