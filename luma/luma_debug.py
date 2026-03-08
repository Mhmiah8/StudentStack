# debug_luma_api.py
import requests

# Try different base URLs
base_urls = [
    "https://luma.com/api",
    "https://api.luma.com",
    "https://luma.com/_next/data",
    "https://luma.com"
]

endpoint = "/get-paginated-events"

params = {
    "latitude": 51.50853,
    "longitude": -0.12574,
    "pagination_limit": 10,
    "slug": "tech"
}

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://luma.com/explore?category=tech'
}

print("🔍 Testing different API base URLs...")
print("=" * 60)

for base in base_urls:
    url = f"{base}{endpoint}"
    try:
        print(f"\n📡 Testing: {url}")
        response = requests.get(url, params=params, headers=headers, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            print(f"   ✅ SUCCESS!")
            try:
                data = response.json()
                events = data.get('events', [])
                print(f"   Found {len(events)} events")
                
                # Check for hackathons
                hack_count = 0
                for event in events:
                    name = event.get('name', '').lower()
                    desc = event.get('description', '').lower()
                    if 'hack' in name or 'hack' in desc:
                        hack_count += 1
                        print(f"   🎯 Hackathon found: {event.get('name')}")
                
                print(f"   Total hackathons: {hack_count}")
                
            except Exception as e:
                print(f"   Error parsing JSON: {e}")
        else:
            print(f"   Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")