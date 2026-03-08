import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests

API_URL = "https://api.the-trackr.com/programmes"
CATEGORIES = [
    "summer-internships",
    "industrial-placements",
    "graduate-programmes",
    "spring-weeks",
]


def fetch_count(season: str, category: str) -> int:
    params = {
        "region": "UK",
        "industry": "Technology",
        "season": season,
        "type": category,
    }
    response = requests.get(API_URL, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    return len(payload) if isinstance(payload, list) else 0


def analyze_local_file(path: Path):
    if not path.exists():
        return 0, {}

    data = json.loads(path.read_text(encoding="utf-8"))
    total = len(data) if isinstance(data, list) else 0
    by_category = defaultdict(int)

    if isinstance(data, list):
        for row in data:
            by_category[row.get("category", "unknown")] += 1

    return total, dict(by_category)


def main():
    parser = argparse.ArgumentParser(description="Diagnose Trackr job count changes")
    parser.add_argument("--seasons", default="2026,2027", help="Comma-separated seasons to check")
    parser.add_argument("--local-file", default="data/jobs_latest.json", help="Local jobs json to compare")
    args = parser.parse_args()

    seasons = [s.strip() for s in args.seasons.split(",") if s.strip()]

    print("=" * 70)
    print("TRACKR COUNT DIAGNOSTIC")
    print("=" * 70)
    print(f"Run time: {datetime.now().isoformat()}")
    print(f"Seasons: {', '.join(seasons)}")

    local_total, local_by_category = analyze_local_file(Path(args.local_file))
    print(f"Local file: {args.local_file}")
    print(f"Local total jobs: {local_total}")
    if local_by_category:
        for category in CATEGORIES:
            print(f"  local {category}: {local_by_category.get(category, 0)}")

    api_total_all_seasons = 0
    print("\nAPI counts:")
    for season in seasons:
        season_total = 0
        print(f"Season {season}:")
        for category in CATEGORIES:
            try:
                count = fetch_count(season, category)
                print(f"  {category}: {count}")
                season_total += count
            except Exception as exc:
                print(f"  {category}: ERROR ({exc})")
        print(f"  season total: {season_total}")
        api_total_all_seasons += season_total

    print("\nSummary:")
    print(f"  local total: {local_total}")
    print(f"  api total across checked seasons: {api_total_all_seasons}")

    if local_total == 0:
        print("  finding: local jobs file empty or missing")
    elif api_total_all_seasons == 0:
        print("  finding: API returned zero for checked seasons; check season selection or API changes")
    elif local_total < api_total_all_seasons:
        print("  finding: API has more jobs than local file; scraper scope/logic may be limiting results")
    elif local_total == api_total_all_seasons:
        print("  finding: local file matches checked API totals")
    else:
        print("  finding: local file has more jobs than current checked API totals (possibly older merged data)")


if __name__ == "__main__":
    main()
