from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent

CHECKS = {
    "index.html": [
        "UCL Hack 2023",
        "AI For Good",
        "CyberDash '23",
        "Google Generation Scholarship",
        "Amazon Future Engineer",
        "Goldman Sachs Scholars",
        "@alex_dev",
        "@sarah_codes",
        "@mike_j",
        ">768<",
        ">500+<",
        ">5<"
    ],
    "js/load-trackr-jobs.js": [
        "updateOpportunitiesCount(768)",
        "UCL Hack 2023",
    ],
    "js/load-hackathons.js": [
        "UCL Hack 2023",
        "AI For Good",
        "CyberDash",
    ]
}

REQUIRED_FILES = [
    "data/jobs_latest.json",
    "data/recent_jobs.json",
    "data/hackathons_latest.json",
    "data/recent_hackathons.json",
    "data/jobs_summary.json",
    "data/site_content.json",
]

REQUIRED_IDS = [
    'id="opportunities-count"',
    'id="top-universities-count"',
    'id="active-students-count"',
    'id="jobs-container"',
    'id="hackathons-container"',
    'id="universities-tabs"',
    'id="universities-modules-container"',
    'id="grants-table-body"',
    'id="community-groups-container"',
    'id="team-posts-container"',
]


def main():
    failures = []

    for rel_path, banned_values in CHECKS.items():
        file_path = ROOT / rel_path
        if not file_path.exists():
            failures.append(f"Missing file: {rel_path}")
            continue
        content = file_path.read_text(encoding="utf-8")
        for value in banned_values:
            if value in content:
                failures.append(f"Hardcoded value found in {rel_path}: {value}")

    code_html = (ROOT / "index.html").read_text(encoding="utf-8")
    for required_id in REQUIRED_IDS:
        if required_id not in code_html:
            failures.append(f"Missing required dynamic container in index.html: {required_id}")

    for rel_path in REQUIRED_FILES:
        file_path = ROOT / rel_path
        if not file_path.exists():
            failures.append(f"Missing required data file: {rel_path}")

    try:
        jobs = json.loads((ROOT / "data/jobs_latest.json").read_text(encoding="utf-8"))
        summary = json.loads((ROOT / "data/jobs_summary.json").read_text(encoding="utf-8"))
        if isinstance(jobs, list) and isinstance(summary, dict):
            if summary.get("total_jobs") != len(jobs):
                failures.append(
                    f"jobs_summary total_jobs ({summary.get('total_jobs')}) does not match jobs_latest count ({len(jobs)})"
                )
    except Exception as exc:
        failures.append(f"Could not validate jobs summary consistency: {exc}")

    if failures:
        print("DYNAMIC DATA VERIFICATION: FAILED")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print("DYNAMIC DATA VERIFICATION: PASSED")


if __name__ == "__main__":
    main()
