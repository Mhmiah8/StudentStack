# luma_explore_scraper.py
import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import time
import os
import re

class LumaExploreScraper:
    def __init__(self):
        self.base_url = "https://luma.com"
        self.explore_url = "https://luma.com/explore"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
            'Referer': 'https://luma.com/'
        }
        
    def search_events(self, keyword="hackathon", category="tech", max_pages=5):
        """Search for events containing keyword"""
        
        all_events = []
        
        for page in range(1, max_pages + 1):
            print(f"\n📥 Searching page {page} for '{keyword}' events...")
            
            params = {
                'category': category,
                'q': keyword,
                'page': page,
                'sort': 'date'
            }
            
            try:
                response = requests.get(self.explore_url, params=params, headers=self.headers, timeout=30)
                
                if response.status_code == 200:
                    events = self.extract_events_from_page(response.text)
                    
                    # Filter for hackathons and UK
                    filtered = []
                    for event in events:
                        name = event.get('name', '').lower()
                        location = event.get('location', '').lower()
                        
                        # Check if it's a hackathon
                        is_hackathon = any(term in name for term in ['hackathon', 'hack', 'build', 'code'])
                        
                        # Check if UK or virtual
                        is_uk = any(term in location for term in ['uk', 'london', 'manchester', 'birmingham', 'edinburgh', 'bristol', 'england', 'scotland', 'wales'])
                        is_virtual = any(term in location for term in ['virtual', 'online', 'remote', 'zoom'])
                        
                        if is_hackathon and (is_uk or is_virtual):
                            event['is_uk'] = is_uk
                            event['is_virtual'] = is_virtual
                            filtered.append(event)
                    
                    all_events.extend(filtered)
                    print(f"✅ Found {len(filtered)} hackathons on page {page}")
                    
                    # If no events found, we've reached the end
                    if len(filtered) == 0:
                        print("No more hackathons found, stopping")
                        break
                        
                else:
                    print(f"❌ Failed with status {response.status_code}")
                    break
                    
            except Exception as e:
                print(f"❌ Error: {e}")
                break
            
            # Be polite to server
            time.sleep(3)
        
        return all_events
    
    def extract_events_from_page(self, html):
        """Extract event cards from page HTML"""
        
        soup = BeautifulSoup(html, 'html.parser')
        events = []
        
        # Look for event cards - try different possible class names
        possible_classes = ['event-card', 'EventCard', 'card', 'listing-item', 'event-item']
        
        event_cards = []
        for cls in possible_classes:
            cards = soup.find_all('div', class_=re.compile(cls, re.I))
            if cards:
                event_cards = cards
                print(f"Found cards with class '{cls}': {len(cards)}")
                break
        
        # If still no cards, try looking for links to events
        if not event_cards:
            event_links = soup.find_all('a', href=re.compile('/event/|/e/'))
            print(f"Found {len(event_links)} event links")
            
            # Try to extract info from parent containers
            for link in event_links:
                parent = link.find_parent(['div', 'article'])
                if parent:
                    event_cards.append(parent)
        
        for card in event_cards:
            try:
                # Extract event name
                name_elem = card.find(['h2', 'h3', 'h4', 'span'], class_=re.compile('title|name|event-title|heading', re.I))
                if not name_elem:
                    name_elem = card.find(['h2', 'h3', 'h4'])
                name = name_elem.get_text(strip=True) if name_elem else 'Unknown'
                
                # Extract date
                date_elem = card.find(['time', 'span'], class_=re.compile('date|time|event-date|datetime', re.I))
                if not date_elem:
                    date_elem = card.find('div', string=re.compile(r'\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2}'))
                date = date_elem.get_text(strip=True) if date_elem else 'TBA'
                
                # Extract location
                loc_elem = card.find(['span', 'div'], class_=re.compile('location|venue|place|address', re.I))
                if not loc_elem:
                    loc_elem = card.find('div', string=re.compile('london|uk|virtual|online', re.I))
                location = loc_elem.get_text(strip=True) if loc_elem else 'TBA'
                
                # Extract URL
                link = card.find('a', href=True)
                url = link['href'] if link else '#'
                if url.startswith('/'):
                    url = self.base_url + url
                
                # Extract host/organizer
                host_elem = card.find(['span', 'div'], class_=re.compile('host|organizer|author|creator', re.I))
                host = host_elem.get_text(strip=True) if host_elem else 'Unknown'
                
                event = {
                    'name': name,
                    'date': date,
                    'location': location,
                    'host': host,
                    'url': url,
                    'scraped_date': datetime.now().isoformat(),
                    'source': 'luma_explore'
                }
                events.append(event)
                
            except Exception as e:
                print(f"⚠️ Error parsing card: {e}")
                continue
        
        return events
    
    def save_events(self, events):
        """Save events to JSON files"""
        
        if not events:
            print("❌ No events to save")
            return
        
        os.makedirs('data', exist_ok=True)
        
        # Save all events
        with open('data/hackathons_latest.json', 'w', encoding='utf-8') as f:
            json.dump(events, f, indent=2, ensure_ascii=False)
        print(f"💾 Saved {len(events)} events to data/hackathons_latest.json")
        
        # Save recent for homepage
        recent = events[:3]
        with open('data/recent_hackathons.json', 'w', encoding='utf-8') as f:
            json.dump(recent, f, indent=2)
        print(f"💾 Saved 3 recent events to data/recent_hackathons.json")
        
        # Count UK vs Virtual
        uk_count = sum(1 for e in events if 'uk' in e.get('location', '').lower() or any(city in e.get('location', '').lower() for city in ['london', 'manchester', 'birmingham']))
        virtual_count = sum(1 for e in events if 'virtual' in e.get('location', '').lower() or 'online' in e.get('location', '').lower())
        
        print(f"\n📊 Summary:")
        print(f"   Total hackathons: {len(events)}")
        print(f"   UK events: {uk_count}")
        print(f"   Virtual events: {virtual_count}")

# Quick test function
def test_explore_page():
    """Test if we can access the explore page"""
    url = "https://luma.com/explore?category=tech"
    response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    print(f"Explore page status: {response.status_code}")
    
    if response.status_code == 200:
        with open('luma_test.html', 'w', encoding='utf-8') as f:
            f.write(response.text)
        print("✅ Saved test page to luma_test.html")
        return True
    return False

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 LUMA EXPLORE SCRAPER")
    print("=" * 60)
    
    # Test connection first
    if test_explore_page():
        print("✅ Connection to luma.com successful!")
        
        scraper = LumaExploreScraper()
        
        # Ask what to search for
        keyword = input("\n🔍 Search keyword (default: hackathon): ").strip()
        if not keyword:
            keyword = "hackathon"
        
        pages = input("📄 Number of pages to scrape (default: 5): ").strip()
        pages = int(pages) if pages.isdigit() else 5
        
        print(f"\n🔍 Searching for '{keyword}' events...")
        events = scraper.search_events(keyword=keyword, max_pages=pages)
        
        if events:
            scraper.save_events(events)
            
            print("\n📋 Sample hackathons:")
            for i, event in enumerate(events[:3]):
                print(f"\n  {i+1}. {event['name']}")
                print(f"     📅 {event['date']}")
                print(f"     📍 {event['location']}")
                print(f"     🔗 {event['url']}")
        else:
            print("❌ No hackathons found")
    else:
        print("❌ Cannot connect to luma.com")