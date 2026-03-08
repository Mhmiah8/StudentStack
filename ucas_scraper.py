# ucas_scraper.py
import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime, timezone
import time
import os
import re
import argparse
import sys
import io

if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


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


if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


class UCASScraper:
    def __init__(self):
        self.base_url = env_str("UCAS_BASE_URL", "https://www.ucas.com")
        self.search_url = env_str("UCAS_SEARCH_URL", "https://www.ucas.com/explore/search/scholarships-and-bursaries")
        self.timeout_seconds = env_int("UCAS_TIMEOUT_SECONDS", 30)
        self.headers = {
            'User-Agent': env_str('UCAS_USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
        }

    def parse_deadline_date(self, deadline_text):
        """Parse UCAS deadline strings like '27 Aug 2026' into a date"""

        if not deadline_text:
            return None

        normalized = str(deadline_text).strip()
        if normalized.lower() == 'none':
            return None

        try:
            return datetime.strptime(normalized, "%d %b %Y").date()
        except ValueError:
            return None

    def filter_active_scholarships(self, scholarships):
        """Keep opportunities with no deadline or deadlines not yet passed"""

        today = datetime.now(timezone.utc).date()
        active = []

        for item in scholarships:
            deadline_date = self.parse_deadline_date(item.get('deadline'))
            if deadline_date and deadline_date < today:
                continue
            active.append(item)

        return active

    def extract_result_count(self, html):
        """Extract total UCAS result count, e.g. '914 results'"""

        if not html:
            return None

        match = re.search(r'(\d+)\s+results', html, re.IGNORECASE)
        if match:
            return f"{match.group(1)}+"
        return None

    def extract_amount(self, entry_text):
        """Extract amount while preserving common UCAS formats"""

        text = re.sub(r'\s+', ' ', entry_text).strip()

        patterns = [
            r'Between\s*[£€$]\s*[\d,]+(?:\.\d+)?\s*to\s*[£€$]?\s*[\d,]+(?:\.\d+)?',
            r'Up\s*to\s*[£€$]\s*[\d,]+(?:\.\d+)?',
            r'[£€$]\s*[\d,]+(?:\.\d+)?',
            r'\b\d+%\b'
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0).replace('  ', ' ').strip()

        return 'Amount not specified'
        
    def fetch_page(self, page=1):
        """Fetch a page of scholarship results"""
        
        params = {'page': page}
        print(f"📥 Fetching page {page}...")
        
        try:
            response = requests.get(self.search_url, params=params, headers=self.headers, timeout=self.timeout_seconds)
            if response.status_code == 200:
                return response.text
            else:
                print(f"❌ Failed with status {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Error: {e}")
            return None
    
    def parse_scholarships(self, html):
        """Extract scholarship entries from page HTML"""
        
        soup = BeautifulSoup(html, 'html.parser')
        scholarships = []
        
        # Find all scholarship entries - UCAS uses search-result class
        entries = soup.find_all('div', class_='search-result')
        
        if not entries:
            # Try alternative selectors
            entries = soup.find_all('article') or soup.find_all('div', class_=re.compile('result|card|item'))
        
        print(f"Found {len(entries)} entries on page")

        seen = set()
        
        for entry in entries:
            try:
                # Extract title (in h3 tag)
                title_elem = entry.find('h3')
                if title_elem and title_elem.find('a'):
                    title = title_elem.find('a').get_text(strip=True)
                else:
                    title = title_elem.get_text(strip=True) if title_elem else 'Unknown'
                
                # Extract university - usually in paragraph after title
                uni_elem = entry.find('p', class_='search-result__institution')
                if not uni_elem:
                    # Try to find any paragraph with university-like text
                    all_ps = entry.find_all('p')
                    for p in all_ps:
                        text = p.get_text()
                        if 'University' in text or 'College' in text:
                            uni_elem = p
                            break
                university = uni_elem.get_text(strip=True) if uni_elem else 'Unknown'
                
                # Extract amount - look for £ symbol
                entry_text = entry.get_text()
                amount = self.extract_amount(entry_text)
                if amount == 'Amount not specified':
                    parts = [part.strip() for part in entry.stripped_strings if part.strip()]
                    for part in reversed(parts):
                        if re.search(r'[£€$]|%|Between\s+[£€$]|Up\s*to\s*[£€$]', part, re.IGNORECASE):
                            amount = part
                            break
                
                # Extract deadline
                deadline_match = re.search(
                    r'Funding\s+application\s+deadline[:\s]*(None|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})',
                    entry_text,
                    re.I
                )
                deadline = deadline_match.group(1) if deadline_match else 'None'
                
                # Extract link
                link_elem = entry.find('a', href=True)
                link = link_elem['href'] if link_elem else '#'
                if link.startswith('/'):
                    link = self.base_url + link

                unique_key = link if link and link != '#' else f"{title}|{university}"
                if unique_key in seen:
                    continue
                seen.add(unique_key)
                
                scholarship = {
                    'title': title,
                    'university': university,
                    'amount': amount,
                    'deadline': deadline,
                    'url': link,
                    'scraped_date': datetime.now().isoformat(),
                    'source': 'UCAS'
                }
                
                scholarships.append(scholarship)
                
            except Exception as e:
                print(f"⚠️ Error parsing entry: {e}")
                continue
        
        return scholarships
    
    def scrape_all_pages(self, max_pages=5):
        """Scrape multiple pages (start with 5 for testing)"""
        
        all_scholarships = []
        result_count = None
        
        for page in range(1, max_pages + 1):
            html = self.fetch_page(page)
            if html:
                if page == 1:
                    result_count = self.extract_result_count(html)
                scholarships = self.parse_scholarships(html)
                all_scholarships.extend(scholarships)
                print(f"✅ Page {page}: Found {len(scholarships)} scholarships")
                
                if len(scholarships) == 0:
                    print("No more scholarships found, stopping")
                    break
                
                time.sleep(env_int("UCAS_REQUEST_INTERVAL_SECONDS", 2))  # Be polite
            else:
                break
        
        return all_scholarships, result_count
    
    def save_scholarships(self, scholarships, result_count=None):
        """Save scholarships to JSON files"""
        
        if not scholarships:
            print("❌ No scholarships to save")
            return False
        
        os.makedirs('data', exist_ok=True)
        
        # Save all scholarships
        with open('data/scholarships_latest.json', 'w', encoding='utf-8') as f:
            json.dump(scholarships, f, indent=2, ensure_ascii=False)
        print(f"💾 Saved {len(scholarships)} scholarships to data/scholarships_latest.json")
        
        # Save sample for homepage
        recent = scholarships[:5]
        with open('data/recent_scholarships.json', 'w', encoding='utf-8') as f:
            json.dump(recent, f, indent=2)
        print(f"💾 Saved 5 recent scholarships to data/recent_scholarships.json")
        
        # Update site_content.json with fresh data
        self.update_site_content(scholarships, result_count=result_count)
        
        return True
    
    def update_site_content(self, scholarship_items, result_count=None):
        """Update site_content.json with fresh scholarship data"""
        
        site_content_path = 'data/site_content.json'
        
        try:
            with open(site_content_path, 'r', encoding='utf-8') as f:
                site_content = json.load(f)
        except FileNotFoundError:
            print("⚠️ site_content.json not found, skipping update")
            return
        
        # Update grants section with fresh data
        if 'grants' in site_content and 'live_opportunities' in site_content['grants']:
            active_items = self.filter_active_scholarships(scholarship_items)

            # Format items for display
            formatted_items = []
            for s in active_items:
                formatted_items.append({
                    'name': s['title'],
                    'amount': s['amount'],
                    'eligibility': s['university'],
                    'deadline': s['deadline'],
                    'url': s['url'],
                    'action': 'View Details',
                    'scraped_date': s.get('scraped_date')
                })
            
            site_content['grants']['live_opportunities']['items'] = formatted_items
            site_content['grants']['live_opportunities']['last_updated'] = datetime.now().strftime('%Y-%m-%d')
            if result_count:
                site_content['grants']['live_opportunities']['result_count'] = result_count
            
            # Save updated content
            with open(site_content_path, 'w', encoding='utf-8') as f:
                json.dump(site_content, f, indent=2, ensure_ascii=False)
            print(f"✅ Updated site_content.json with {len(formatted_items)} fresh scholarships")

# Test function
def test_connection():
    """Test if we can access UCAS"""
    try:
        response = requests.get("https://www.ucas.com", headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
        print(f"UCAS homepage status: {response.status_code}")
        return response.status_code == 200
    except:
        return False


def parse_args():
    parser = argparse.ArgumentParser(description="UCAS scholarships scraper")
    parser.add_argument("--pages", type=int, default=None, help="Pages to scrape (1-46)")
    return parser.parse_args()

if __name__ == "__main__":
    print("=" * 60)
    print("🎓 UCAS SCHOLARSHIPS SCRAPER")
    print("=" * 60)
    
    if test_connection():
        print("✅ Connected to UCAS successfully!")
        
        scraper = UCASScraper()

        args = parse_args()
        
        # Ask how many pages to scrape
        if args.pages and 1 <= args.pages <= 46:
            pages = args.pages
            print(f"\n📄 Using CLI pages value: {pages}")
        else:
            env_pages = env_int("UCAS_PAGES", 3)
            pages = input(f"\n📄 How many pages to scrape? (1-46, default {env_pages}): ").strip()
            pages = int(pages) if pages.isdigit() and 1 <= int(pages) <= 46 else env_pages
        
        print(f"\n🔍 Scraping {pages} pages...\n")
        scholarships, result_count = scraper.scrape_all_pages(max_pages=pages)
        
        if scholarships:
            scraper.save_scholarships(scholarships, result_count=result_count)
            
            print(f"\n✅ COMPLETE! Found {len(scholarships)} scholarships")
            
            print("\n📋 Sample scholarships:")
            for i, s in enumerate(scholarships[:3]):
                print(f"\n  {i+1}. {s['title']}")
                print(f"     🏛️  {s['university']}")
                print(f"     💰 {s['amount']}")
                print(f"     📅 {s['deadline']}")
        else:
            print("❌ No scholarships found")
    else:
        print("❌ Cannot connect to UCAS")