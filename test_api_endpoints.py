# test_api_endpoints.py
import requests
import json

base_api = "https://api.the-trackr.com"
endpoints = [
    "/programmes",
    "/programmes/list",
    "/programmes/data",
    "/programmes/all",
    "/programmes/uk-technology",
    "/jobs",
    "/jobs/list",
    "/technology/programmes",
    "/v1/programmes",
    "/api/programmes"
]

params = {
    "region": "UK",
    "industry": "Technology",
    "season": "2026",
    "type": "summer-internships"
}

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://app.the-trackr.com/uk-technology/summer-internships'
}

print("🔍 Testing API endpoints for job data...")
print("=" * 70)

for endpoint in endpoints:
    url = f"{base_api}{endpoint}"
    try:
        # Try without params first
        print(f"\n📌 Testing: {url}")
        response = requests.get(url, headers=headers, timeout=5)
        print(f"   Status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type', 'unknown')}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"   ✅ Got JSON response")
                if isinstance(data, list):
                    print(f"   📊 List with {len(data)} items")
                    if len(data) > 0:
                        print(f"   Sample: {json.dumps(data[0], indent=2)[:200]}")
                elif isinstance(data, dict):
                    print(f"   📊 Dict with keys: {list(data.keys())}")
            except:
                print(f"   ❌ Response is not JSON")
                print(f"   Preview: {response.text[:100]}")
        
        # Try with params
        print(f"\n   🔄 With params: {url}")
        response2 = requests.get(url, params=params, headers=headers, timeout=5)
        print(f"   Status: {response2.status_code}")
        
        if response2.status_code == 200:
            try:
                data2 = response2.json()
                print(f"   ✅ Got JSON response with params")
            except:
                pass
                
    except Exception as e:
        print(f"   ❌ Error: {e}")

print("\n" + "=" * 70)
print("Also check in Browser DevTools Network tab for:")
print("- XHR requests to api.the-trackr.com")
print("- Look for requests that return arrays of jobs")
print("- Check the 'Preview' tab to see the data structure")