# find_luma_api.py
import requests

# Common API patterns to test
api_endpoints = [
    "https://luma.com/api/events",
    "https://luma.com/api/explore",
    "https://api.luma.com/events",
    "https://luma.com/api/v1/events",
    "https://luma.com/api/search",
    "https://luma.com/api/discover",
]

params = {
    "category": "tech",
    "q": "hackathon",
    "page": 1,
    "limit": 20
}

headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json'
}

print("🔍 Searching for LUMA API...")
print("=" * 60)

for endpoint in api_endpoints:
    try:
        print(f"\n📡 Testing: {endpoint}")
        response = requests.get(endpoint, params=params, headers=headers, timeout=5)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"   ✅ Got JSON! Type: {type(data)}")
                if isinstance(data, dict):
                    print(f"   Keys: {list(data.keys())}")
                elif isinstance(data, list):
                    print(f"   List length: {len(data)}")
            except:
                print(f"   ❌ Not JSON: {response.text[:100]}")
    except Exception as e:
        print(f"   ❌ Error: {e}")