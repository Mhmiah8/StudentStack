# inspect_luma_structure.py
from bs4 import BeautifulSoup

with open('luma_test.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("🔍 LUMA PAGE STRUCTURE ANALYSIS")
print("=" * 60)

# Look for event containers
print("\n📦 Looking for event containers...")
containers = soup.find_all(['div', 'article'], class_=True)
for c in containers[:10]:  # Check first 10
    classes = ' '.join(c.get('class', []))
    if 'event' in classes.lower() or 'card' in classes.lower():
        print(f"Found: {classes}")

# Look for links to events
print("\n🔗 Looking for event links...")
event_links = soup.find_all('a', href=True)
for link in event_links[:20]:
    href = link['href']
    if '/event/' in href or '/e/' in href:
        print(f"Event link: {href}")
        print(f"Link text: {link.text.strip()[:50]}")
        print("-" * 40)

# Look for hackathon mentions
print("\n🎯 Looking for 'hackathon' mentions...")
text = soup.get_text().lower()
hack_count = text.count('hackathon')
print(f"'hackathon' appears: {hack_count} times")

# Save a snippet of the page around hackathon mentions
if hack_count > 0:
    import re
    matches = re.finditer(r'[^.]*?hackathon[^.]*\.', text)
    for i, match in enumerate(matches):
        if i < 3:  # First 3 matches
            print(f"\nContext {i+1}: {match.group()}")