# inspect_trackr.py
import requests

url = "https://app.the-trackr.com/uk-technology/summer-internships"
headers = {'User-Agent': 'Mozilla/5.0'}

response = requests.get(url, headers=headers)

print(f"Status: {response.status_code}")
print(f"Content length: {len(response.text)}")

# Save the HTML
with open('debug.html', 'w', encoding='utf-8') as f:
    f.write(response.text)
print("Saved to debug.html")

# Check if job data exists
keywords = ['trackr-tracker-row', 'Google', 'Amazon', 'Microsoft', 'company']
for keyword in keywords:
    print(f"Contains '{keyword}': {keyword in response.text}")