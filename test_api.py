# test_api.py
import requests
import json

url = "https://app.the-trackr.com/programmes"
params = {
    "region": "UK",
    "industry": "Technology",
    "season": "2026",
    "type": "summer-internships"
}

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json'
}

print(f"🔍 Testing API: {url}")
print(f"Params: {params}")
print("=" * 60)

response = requests.get(url, params=params, headers=headers)

print(f"Status: {response.status_code}")

if response.status_code == 200:
    try:
        data = response.json()
        print(f"✅ Success! Got data of type: {type(data)}")
        
        if isinstance(data, list):
            print(f"Number of items: {len(data)}")
            if len(data) > 0:
                print("\n📋 First item sample:")
                print(json.dumps(data[0], indent=2)[:500])
        elif isinstance(data, dict):
            print(f"Keys: {list(data.keys())}")
            if 'data' in data:
                print(f"Number of items in data: {len(data['data'])}")
    except Exception as e:
        print(f"❌ Error parsing JSON: {e}")
        print(f"Response text: {response.text[:200]}")
else:
    print(f"❌ Failed with status {response.status_code}")