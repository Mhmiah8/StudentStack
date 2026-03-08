# test_jobs_api.py
import requests
import json

# The working endpoint from your test
url = "https://api.the-trackr.com/programmes"
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

print("🔍 Testing the jobs API...")
print(f"URL: {url}")
print(f"Params: {params}")
print("=" * 50)

response = requests.get(url, params=params, headers=headers)

print(f"Status Code: {response.status_code}")

if response.status_code == 200:
    print("✅ SUCCESS! Got data")
    data = response.json()
    print(f"Number of jobs: {len(data)}")
    
    if len(data) > 0:
        print("\n📋 First job sample:")
        # Pretty print the first job
        first_job = data[0]
        print(json.dumps(first_job, indent=2)[:500])
        
        # Show key fields we care about
        print("\n🔑 Key fields:")
        if 'company' in first_job:
            print(f"Company: {first_job['company']}")
        if 'programme_name' in first_job or 'name' in first_job:
            name = first_job.get('programme_name') or first_job.get('name')
            print(f"Programme: {name}")
        if 'closing_date' in first_job:
            print(f"Closing: {first_job['closing_date']}")
else:
    print(f"❌ Failed with status {response.status_code}")
    print(f"Response: {response.text[:200]}")