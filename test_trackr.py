# trackr_scraper_fixed.py
import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime
import time
import json
import os
import re

class TrackrScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://app.the-trackr.com/uk-technology/summer-internships',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
        self.session = requests.Session()
        
    def get_page_with_popup_closed(self, url):
        """Get page and try to bypass/close the popup"""
        
        print(f"🌐 Fetching {url}...")
        
        # First request to get cookies and initial page
        response = self.session.get(url, headers=self.headers, timeout=30)
        
        # The popup might be loaded via JavaScript, so we need to look for the actual data
        # Sometimes the data is in the HTML but hidden by CSS/JS
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check if we got the data directly
        data_elements = soup.find_all('trackr-tracker-row')
        
        if data_elements:
            print(f"✅ Found data directly ({len(data_elements)} rows)")
            return response.text
        
        # If no data, the popup might be blocking it
        # Sometimes the data is still in the HTML but hidden
        print("⚠️ Popup might be present, checking for hidden data...")
        
        # Look for any script tags that might contain the data as JSON
        scripts = soup.find_all('script')
        for script in scripts:
            if script.string and ('trackr-tracker-row' in script.string or 'company' in script.string):
                print("🔍 Found potential data in script tags")
                # This would need more complex parsing
        
        # Alternative: Try with different headers or cookies
        self.headers['X-Requested-With'] = 'XMLHttpRequest'
        response2 = self.session.get(url, headers=self.headers)
        
        return response2.text
    
    def extract_jobs_from_html(self, html, category_name):
        """Extract job data from HTML, even if popup is present"""
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Method 1: Look for trackr-tracker-row elements
        job_rows = soup.find_all('trackr-tracker-row')
        
        # Method 2: If no rows found, look for the table structure directly
        if not job_rows:
            print("🔍 Trying alternative extraction method...")
            # Look for any table rows that might contain job data
            all_rows = soup.find_all('tr')
            for row in all_rows:
                # Check if this row has company and programme links
                company_link = row.find('a', href=lambda x: x and '/company/' in x)
                prog_link = row.find('a', class_='text-trackr-link-blue')
                
                if company_link and prog_link:
                    # This is likely a job row even without trackr-tracker-row tag
                    # We need to wrap it to use our existing parsing logic
                    # Create a simple wrapper or parse directly
                    pass
        
        jobs = []
        
        for row in job_rows:
            try:
                # Extract company
                company_tag = row.find('a', href=lambda x: x and '/company/' in x)
                company = company_tag.get_text(strip=True) if company_tag else 'N/A'
                
                # Extract programme
                prog_tag = row.find('a', class_='text-trackr-link-blue')
                if not prog_tag:
                    prog_tag = row.find('a', href=lambda x: x and 'http' in x and not '/company/' in x)
                
                programme = prog_tag.get_text(strip=True) if prog_tag else 'N/A'
                programme_url = prog_tag.get('href', '') if prog_tag else ''
                
                # Get all cells
                cells = row.find_all('td')
                
                job = {
                    'category': category_name,
                    'company': company,
                    'programme': programme,
                    'programme_url': programme_url,
                    'opening_date': cells[3].get_text(strip=True) if len(cells) > 3 else '',
                    'closing_date': cells[4].get_text(strip=True) if len(cells) > 4 else '',
                    'last_year_opening': cells[5].get_text(strip=True) if len(cells) > 5 else '',
                    'cv_required': cells[6].get_text(strip=True) if len(cells) > 6 else '',
                    'cover_letter': cells[7].get_text(strip=True) if len(cells) > 7 else '',
                    'written_answers': cells[8].get_text(strip=True) if len(cells) > 8 else '',
                    'scraped_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'source_url': url if 'url' in locals() else ''
                }
                
                if company != 'N/A' and programme != 'N/A' and company and programme:
                    jobs.append(job)
                    
            except Exception as e:
                print(f"⚠️ Error parsing row: {e}")
                continue
        
        return jobs
    
    def scrape_category(self, url, category_name):
        """Scrape a single category"""
        
        html = self.get_page_with_popup_closed(url)
        jobs = self.extract_jobs_from_html(html, category_name)
        print(f"✅ Found {len(jobs)} jobs in {category_name}")
        
        return jobs

# Test function to see what's actually in the page
def inspect_page_content():
    """Inspect what content we actually get"""
    url = "https://app.the-trackr.com/uk-technology/summer-internships"
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    response = requests.get(url, headers=headers)
    
    print(f"Status: {response.status_code}")
    print(f"Content length: {len(response.text)}")
    
    # Save the HTML to inspect it
    with open('trackr_page_debug.html', 'w', encoding='utf-8') as f:
        f.write(response.text)
    print("💾 Saved HTML to trackr_page_debug.html for inspection")
    
    # Check for key elements
    keywords = ['trackr-tracker-row', 'company', 'internship', 'Google', 'sign up', 'popup']
    for keyword in keywords:
        found = keyword in response.text.lower()
        print(f"Contains '{keyword}': {found}")

if __name__ == "__main__":
    print("🔍 Inspecting page content first...")
    inspect_page_content()
    
    print("\n" + "="*60)
    input("Check trackr_page_debug.html, then press Enter to continue with scraping...")
    
    # Continue with actual scraping
    scraper = TrackrScraper()
    jobs = scraper.scrape_category(
        "https://app.the-trackr.com/uk-technology/summer-internships", 
        "Summer Internship"
    )
    
    if jobs:
        print(f"\n✅ Sample job: {jobs[0]['company']} - {jobs[0]['programme']}")