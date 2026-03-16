# trackr_scraper_final.py
import requests
import json
from datetime import datetime, timezone
import time
import os
import glob
import pandas as pd
import sys
import io
import argparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def env_str(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value if value else default


def env_int(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def env_float(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def parse_trackr_date(date_value):
    if not date_value or date_value in ("TBA", "None"):
        return None

    if isinstance(date_value, str):
        normalized = date_value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is not None:
                parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
            return parsed
        except ValueError:
            return None

    return None


def get_utc_now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_job_currently_open(job, now_utc=None):
    reference_time = now_utc or get_utc_now_naive()

    opening = parse_trackr_date(job.get('opening_date') or job.get('openingDate'))
    if opening is None:
        return False

    if opening > reference_time:
        return False

    closing = parse_trackr_date(job.get('closing_date') or job.get('closingDate'))
    if closing and closing < reference_time:
        return False

    return True


def recent_sort_key(job):
    opening = parse_trackr_date(job.get('opening_date'))
    scraped = parse_trackr_date(job.get('scraped_date'))

    min_dt = datetime.min

    has_opening = 1 if opening else 0
    opening_key = opening if opening else min_dt
    scraped_key = scraped if scraped else min_dt

    # Prioritize jobs with a real opening date, then newest opening date.
    # Fallback to scraped_date if opening_date is missing.
    return (has_opening, opening_key, scraped_key)


def pick_recent_jobs(jobs, limit=3):
    now_utc = get_utc_now_naive()
    open_jobs = [job for job in jobs if is_job_currently_open(job, now_utc)]
    ordered = sorted(open_jobs, key=recent_sort_key, reverse=True)

    selected = []
    selected_ids = set()

    preferred_categories = [
        "summer-internships",
        "industrial-placements",
        "graduate-programmes"
    ]

    def job_key(job):
        return job.get('id') or f"{job.get('company', '')}|{job.get('programme', '')}|{job.get('category', '')}"

    def has_valid_url(job):
        url = job.get('url')
        return isinstance(url, str) and url.strip().startswith("http")

    def is_candidate(job):
        return has_valid_url(job)

    for category in preferred_categories:
        if len(selected) >= limit:
            break
        for job in ordered:
            if job.get('category') != category:
                continue
            if not is_candidate(job):
                continue
            key = job_key(job)
            if key in selected_ids:
                continue
            selected.append(job)
            selected_ids.add(key)
            break

    for job in ordered:
        if len(selected) >= limit:
            break
        if not is_candidate(job):
            continue
        key = job_key(job)
        if key in selected_ids:
            continue
        selected.append(job)
        selected_ids.add(key)

    for job in ordered:
        if len(selected) >= limit:
            break
        key = job_key(job)
        if key in selected_ids:
            continue
        selected.append(job)
        selected_ids.add(key)

    return selected


def parse_args():
    parser = argparse.ArgumentParser(description="Trackr jobs scraper")
    parser.add_argument("--season", default=env_str("TRACKR_SEASON", "2026"), help="Season year (default: 2026)")

    category_group = parser.add_mutually_exclusive_group()
    category_group.add_argument("--all", action="store_true", help="Fetch all categories")
    category_group.add_argument(
        "--category-choice",
        choices=["1", "2", "3", "4", "5"],
        help="Category choice: 1=all, 2=summer, 3=placements, 4=graduate, 5=spring"
    )

    return parser.parse_args()

class TrackrScraper:
    def __init__(self):
        self.api_url = env_str("TRACKR_API_URL", "https://api.the-trackr.com/programmes")
        self.region = env_str("TRACKR_REGION", "UK")
        self.industry = env_str("TRACKR_INDUSTRY", "Technology")
        self.request_timeout_seconds = env_int("TRACKR_TIMEOUT_SECONDS", 30)
        self.request_interval_seconds = env_float("TRACKR_REQUEST_INTERVAL_SECONDS", 2)
        self.headers = {
            'User-Agent': env_str('TRACKR_USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
            'Accept': 'application/json',
            'Referer': env_str('TRACKR_REFERER', 'https://app.the-trackr.com/uk-technology/summer-internships')
        }

    def get_existing_scraped_dates(self):
        """Load previously seen scraped_date values by job ID so NEW means newly discovered."""
        data_files = ['data/jobs_latest.json'] + sorted(glob.glob('data/trackr_jobs_*.json'))
        if not any(os.path.exists(path) for path in data_files):
            return {}

        existing_dates = {}

        try:
            for path in data_files:
                if not os.path.exists(path):
                    continue

                with open(path, 'r', encoding='utf-8') as f:
                    existing_jobs = json.load(f)
                if not isinstance(existing_jobs, list):
                    continue

                for item in existing_jobs:
                    if not isinstance(item, dict):
                        continue
                    job_id = item.get('id')
                    scraped_date = item.get('scraped_date')
                    if not job_id or not scraped_date:
                        continue

                    previous = existing_dates.get(job_id)
                    if not previous:
                        existing_dates[job_id] = scraped_date
                        continue

                    previous_dt = parse_trackr_date(previous)
                    candidate_dt = parse_trackr_date(scraped_date)
                    if previous_dt and candidate_dt and candidate_dt < previous_dt:
                        existing_dates[job_id] = scraped_date

            return existing_dates
        except Exception:
            return {}
        
    def fetch_category(self, category_type, season="2026", existing_scraped_dates=None):
        """Fetch jobs for a specific category"""

        reference_time = get_utc_now_naive()
        existing_scraped_dates = existing_scraped_dates or {}
        
        params = {
            "region": self.region,
            "industry": self.industry,
            "season": season,
            "type": category_type
        }
        
        print(f"Fetching {category_type}...")
        
        try:
            response = requests.get(
                self.api_url, 
                params=params, 
                headers=self.headers,
                timeout=self.request_timeout_seconds
            )
            
            if response.status_code == 200:
                jobs = response.json()
                
                # Clean and format the data
                formatted_jobs = []
                for job in jobs:
                    # Extract company name properly
                    company_name = "Unknown"
                    if isinstance(job.get('company'), dict):
                        company_name = job['company'].get('name', 'Unknown')
                    elif isinstance(job.get('company'), str):
                        company_name = job['company']
                    
                    # Create a clean job object with only what we need
                    clean_job = {
                        'id': job.get('id', ''),
                        'company': company_name,
                        'programme': job.get('name', ''),
                        'category': category_type,
                        'categories': [item for item in (job.get('categories') or []) if isinstance(item, str) and item.strip()],
                        'season': season,
                        'region': job.get('region', 'UK'),
                        'locations': ', '.join(job.get('locations', [])) if job.get('locations') else 'UK',
                        'opening_date': job.get('openingDate', 'TBA'),
                        'closing_date': job.get('closingDate', 'TBA'),
                        'url': job.get('url', ''),
                        'format': job.get('format', ''),
                        'eligibility': job.get('eligibility', ''),
                        'cv_required': 'Yes' if job.get('cv') else 'No',
                        'rolling': job.get('rolling', False),
                        'scraped_date': existing_scraped_dates.get(job.get('id')) or datetime.now().isoformat()
                    }
                    
                    # Only add if we have essential data and the role is currently open
                    if (
                        clean_job['company'] != 'Unknown'
                        and clean_job['programme']
                        and is_job_currently_open(clean_job, reference_time)
                    ):
                        formatted_jobs.append(clean_job)
                
                print(f"Found {len(formatted_jobs)} jobs in {category_type}")
                return formatted_jobs
            else:
                print(f"Failed with status {response.status_code}")
                return []
                
        except Exception as e:
            print(f"Error: {e}")
            return []
    
    def fetch_all_categories(self, season="2026", existing_scraped_dates=None):
        """Fetch all job categories"""
        
        categories = [
            "summer-internships",
            "industrial-placements",
            "graduate-programmes",
            "spring-weeks"
        ]
        
        all_jobs = []
        
        for category in categories:
            jobs = self.fetch_category(category, season, existing_scraped_dates)
            all_jobs.extend(jobs)
            
            # Be polite to the server - wait between requests
            time.sleep(self.request_interval_seconds)
        
        return all_jobs
    
    def save_jobs(self, jobs):
        """Save jobs to files for your website"""

        now_utc = get_utc_now_naive()
        jobs = [job for job in jobs if is_job_currently_open(job, now_utc)]
        
        if not jobs:
            print("No jobs to save")
            return False
        
        # Create data directory
        os.makedirs('data', exist_ok=True)
        
        # Save timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # 1. Save all jobs (for archive)
        filename = f'data/trackr_jobs_{timestamp}.json'
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(jobs, f, indent=2, ensure_ascii=False)
        print(f"Saved full archive to {filename}")
        
        # 2. Save latest jobs (for your website to load)
        with open('data/jobs_latest.json', 'w', encoding='utf-8') as f:
            json.dump(jobs, f, indent=2, ensure_ascii=False)
        print(f"Saved latest to data/jobs_latest.json")
        
        # 3. Save as CSV for easy viewing
        df = pd.DataFrame(jobs)
        df.to_csv('data/jobs_latest.csv', index=False)
        print(f"Saved to data/jobs_latest.csv")
        
        # 4. Create category-specific files for your homepage
        categories = {}
        for job in jobs:
            cat = job['category']
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(job)
        
        for cat, cat_jobs in categories.items():
            safe_name = cat.replace('-', '_')
            with open(f'data/jobs_{safe_name}.json', 'w', encoding='utf-8') as f:
                json.dump(cat_jobs, f, indent=2, ensure_ascii=False)
            print(f"Saved {len(cat_jobs)} jobs to data/jobs_{safe_name}.json")
        
        recent_jobs = pick_recent_jobs(jobs, limit=3)
        with open('data/recent_jobs.json', 'w', encoding='utf-8') as f:
            json.dump(recent_jobs, f, indent=2)
        print(f"Saved 3 recent jobs to data/recent_jobs.json")

        # 6. Create lightweight summary metadata for homepage counters
        summary = {
            'total_jobs': len(jobs),
            'categories': {cat: len(cat_jobs) for cat, cat_jobs in categories.items()},
            'season': jobs[0].get('season') if jobs else None,
            'last_scraped': datetime.now().isoformat()
        }
        with open('data/jobs_summary.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2)
        print("Saved summary to data/jobs_summary.json")
        
        return True

def main():
    args = parse_args()

    print("=" * 60)
    print("TRACKR JOB SCRAPER")
    print("=" * 60)
    
    scraper = TrackrScraper()
    existing_scraped_dates = scraper.get_existing_scraped_dates()
    
    season = (args.season or env_str("TRACKR_SEASON", "2026")).strip() or "2026"

    if args.all:
        choice = "1"
    elif args.category_choice:
        choice = args.category_choice
    else:
        print("\nCategories:")
        print("1. All categories")
        print("2. Summer Internships only")
        print("3. Industrial Placements only")
        print("4. Graduate Programmes only")
        print("5. Spring Weeks only")
        choice = input("\nSelect option (1-5): ").strip()
    
    if choice == "1":
        jobs = scraper.fetch_all_categories(season, existing_scraped_dates)
    elif choice == "2":
        jobs = scraper.fetch_category("summer-internships", season, existing_scraped_dates)
    elif choice == "3":
        jobs = scraper.fetch_category("industrial-placements", season, existing_scraped_dates)
    elif choice == "4":
        jobs = scraper.fetch_category("graduate-programmes", season, existing_scraped_dates)
    elif choice == "5":
        jobs = scraper.fetch_category("spring-weeks", season, existing_scraped_dates)
    else:
        print("Invalid choice")
        return
    
    if jobs:
        scraper.save_jobs(jobs)
        print(f"\nCOMPLETE! Total jobs: {len(jobs)}")
        
        # Show sample
        print("\nSample jobs:")
        for i, job in enumerate(jobs[:3]):
            print(f"\n  {i+1}. {job['company']} - {job['programme']}")
            print(f"     Closes: {job['closing_date']}")
    else:
        print("No jobs found")

if __name__ == "__main__":
    main()