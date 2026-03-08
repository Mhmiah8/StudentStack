# luma_api_working.py
import requests
import json
from datetime import datetime, timezone
import time
import os
import re
import sys
import io

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


def parse_json_env(name, default):
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else default
    except json.JSONDecodeError:
        return default

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

class LumaAPIScraper:
    def __init__(self):
        self.api_url = env_str("LUMA_API_URL", "https://api2.luma.com/discover/get-paginated-events")
        self.request_timeout_seconds = env_int("LUMA_TIMEOUT_SECONDS", 30)
        self.request_interval_seconds = env_float("LUMA_REQUEST_INTERVAL_SECONDS", 1)
        self.headers = {
            'accept': '*/*',
            'accept-language': 'en-GB',
            'origin': 'https://luma.com',
            'referer': 'https://luma.com/',
            'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': env_str('LUMA_USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'),
            'x-luma-client-type': 'luma-web',
            'x-luma-client-version': env_str('LUMA_CLIENT_VERSION', 'abfcc89aa17f63cefb8adcc7385cb48c27bc8c95'),
            'x-luma-document-referrer': 'https://www.google.com/',
            'x-luma-web-url': env_str('LUMA_WEB_URL', 'https://luma.com/tech')
        }
        self.cookies = parse_json_env('LUMA_COOKIES_JSON', {})
        # London coordinates
        self.latitude = env_float('LUMA_LATITUDE', 51.50853)
        self.longitude = env_float('LUMA_LONGITUDE', -0.12574)

    def parse_event_date(self, value):
        if not value or value == 'TBA':
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return None

    def is_hackathon_like(self, event):
        hack_terms = ['hackathon', 'hack', 'code', 'build', 'datathon', 'ctf', 'game jam']
        name = event.get('name', '')
        description = event.get('description', '')
        short_description = event.get('short_description', '')
        tags = event.get('tags', []) or []
        tag_text = ' '.join([str(tag) for tag in tags])

        text_pool = f"{name} {description} {short_description} {tag_text}".lower()
        return any(term in text_pool for term in hack_terms)

    def is_uk_or_virtual(self, event):
        geo_info = event.get('geo_address_info', {}) or {}
        city = str(geo_info.get('city', '') or '')
        country = str(geo_info.get('country', '') or '')
        full_address = str(geo_info.get('full_address', '') or '')
        location_name = str(event.get('location_name', '') or '')

        location_text = f"{city} {country} {full_address} {location_name}".lower()

        uk_markers = [
            'united kingdom', ' uk', 'london', 'england', 'scotland',
            'wales', 'northern ireland', 'manchester', 'birmingham',
            'leeds', 'glasgow', 'edinburgh', 'bristol', 'cardiff'
        ]

        is_uk = country.lower() in ['united kingdom', 'uk'] or any(marker in location_text for marker in uk_markers)
        is_virtual = (
            event.get('location_type') == 'online'
            or event.get('virtual_info', {}).get('has_access', False)
            or 'online' in location_text
            or 'virtual' in location_text
        )

        return is_uk, is_virtual, city, country, full_address
        
    def fetch_events(self, slug="tech", limit=50, max_pages=5):
        """Fetch paginated events from LUMA API"""

        print(f"Fetching events from {slug}...")
        entries = []
        cursor = None

        try:
            for page in range(1, max_pages + 1):
                params = {
                    "latitude": self.latitude,
                    "longitude": self.longitude,
                    "pagination_limit": limit,
                    "slug": slug
                }
                if cursor:
                    params["cursor"] = cursor

                response = requests.get(
                    self.api_url,
                    params=params,
                    headers=self.headers,
                    cookies=self.cookies,
                    timeout=self.request_timeout_seconds
                )

                if response.status_code != 200:
                    print(f"API error ({slug}, page {page}): {response.status_code}")
                    print(f"Response: {response.text[:200]}")
                    break

                data = response.json()
                page_entries = data.get('entries', [])
                entries.extend(page_entries)
                print(f"  Page {page}: {len(page_entries)} events")

                if not data.get('has_more'):
                    break

                next_cursor = data.get('next_cursor')
                if not next_cursor:
                    break

                cursor = next_cursor
                time.sleep(self.request_interval_seconds)

            print(f"Found {len(entries)} total events in {slug}")

            hackathons = []
            seen = set()
            now = datetime.now(timezone.utc)

            for entry in entries:
                event = entry.get('event', {})
                name = event.get('name', '')

                if not self.is_hackathon_like(event):
                    continue

                is_uk, is_virtual, city, country, full_address = self.is_uk_or_virtual(event)
                if not (is_uk or is_virtual):
                    continue

                event_date = self.parse_event_date(event.get('start_at', 'TBA'))
                if event_date and event_date < now:
                    continue

                event_url = event.get('url', '')
                if event_url and not event_url.startswith('http'):
                    event_url = f"https://lu.ma/{event_url}"

                key = event_url or f"{name}|{event.get('start_at', '')}"
                if key in seen:
                    continue
                seen.add(key)

                hosts = entry.get('hosts', [])
                host_names = [h.get('name', '') for h in hosts if h.get('name')]

                event_data = {
                    'name': name,
                    'date': event.get('start_at', 'TBA'),
                    'end_date': event.get('end_at', ''),
                    'location': full_address,
                    'city': city,
                    'country': country,
                    'is_uk': is_uk,
                    'is_virtual': is_virtual,
                    'url': event_url,
                    'hosts': host_names,
                    'attendee_count': entry.get('guest_count', 0),
                    'scraped_date': datetime.now().isoformat()
                }
                hackathons.append(event_data)
                print(f"  Found: {name}")

            return hackathons

        except Exception as e:
            print(f"Error: {e}")
            return []

    def fetch_all_hackathons(self):
        slugs = ["tech", "ai"]
        all_hackathons = []
        seen = set()

        for slug in slugs:
            slug_events = self.fetch_events(slug=slug, limit=env_int('LUMA_PAGE_LIMIT', 50), max_pages=env_int('LUMA_MAX_PAGES_PER_SLUG', 3))
            for event in slug_events:
                key = event.get('url') or f"{event.get('name')}|{event.get('date')}"
                if key in seen:
                    continue
                seen.add(key)
                all_hackathons.append(event)

            time.sleep(self.request_interval_seconds)

        all_hackathons.sort(
            key=lambda item: self.parse_event_date(item.get('date')) or datetime.max.replace(tzinfo=timezone.utc)
        )

        print(f"\nTotal hackathons found: {len(all_hackathons)}")
        print(f"UK events: {sum(1 for h in all_hackathons if h['is_uk'])}")
        print(f"Virtual events: {sum(1 for h in all_hackathons if h['is_virtual'])}")

        return all_hackathons
    
    def save_hackathons(self, hackathons):
        """Save hackathons to JSON files"""
        
        if not hackathons:
            print("No hackathons to save")
            return False
        
        os.makedirs('data', exist_ok=True)
        
        # Save all hackathons
        with open('data/hackathons_latest.json', 'w', encoding='utf-8') as f:
            json.dump(hackathons, f, indent=2, ensure_ascii=False)
        print(f"Saved {len(hackathons)} hackathons to data/hackathons_latest.json")
        
        # Save recent for homepage
        recent = hackathons[:8]
        with open('data/recent_hackathons.json', 'w', encoding='utf-8') as f:
            json.dump(recent, f, indent=2)
        print(f"Saved {len(recent)} recent hackathons to data/recent_hackathons.json")
        
        return True

if __name__ == "__main__":
    print("=" * 60)
    print("LUMA API SCRAPER (WORKING VERSION)")
    print("=" * 60)
    
    scraper = LumaAPIScraper()
    
    # Fetch events
    hackathons = scraper.fetch_all_hackathons()
    
    if hackathons:
        scraper.save_hackathons(hackathons)
        
        print("\nSample hackathons:")
        for i, h in enumerate(hackathons[:3]):
            print(f"\n  {i+1}. {h['name']}")
            print(f"     Date: {h['date']}")
            print(f"     Location: {h['location'][:100]}...")
            print(f"     {'Virtual' if h['is_virtual'] else 'UK'}")
            print(f"     URL: {h['url']}")
    else:
        print("No hackathons found")