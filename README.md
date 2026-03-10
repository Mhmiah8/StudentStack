Here's a clean, professional README for your StudentStack project:

## 📋 **Copy and paste this into your `README.md` file:**

```markdown
# StudentStack 🎓

**Your All-in-One Launchpad for Tech Success**

StudentStack is a comprehensive dashboard for Computer Science students, aggregating internships, hackathons, grants, and community resources in one place. Built with vanilla JavaScript, Firebase, and powered by daily automated scrapers.

## ✨ Features

### 📊 **Live Opportunities**
- **800+ Tech Jobs** - Internships, placements, and graduate roles from Trackr
- **UK Hackathons** - Curated events from Luma
- **Grants & Scholarships** - 900+ opportunities from UCAS

### 👥 **Community**
- **University Notes** - Share and verify module notes
- **Team Formation** - Find hackathon/project teammates
- **Moderation System** - Report and review content

### 🔐 **User Roles**
- **Basic Users** - Upload notes, create posts, set notifications
- **Moderators** - Verify content, manage reports
- **Admins** - Full platform control

### ⚡ **Smart Features**
- Personalized notification preferences
- Real-time content updates
- Role-based UI
- Daily data refresh

## 🛠️ **Tech Stack**

| Frontend | Backend | Automation |
|----------|---------|------------|
| HTML5 | Firebase Auth | GitHub Actions |
| Tailwind CSS | Cloud Firestore | Python Scrapers |
| Vanilla JavaScript | Firebase Storage | Daily 6AM UTC cron |
| | | Trackr, Luma, UCAS APIs |

## 🚀 **Live Site**

[https://mhmiah8.github.io/StudentStack/code.html](https://mhmiah8.github.io/StudentStack/code.html)

## 📁 **Project Structure**

```
StudentStack/
├── code.html              # Main entry point
├── js/                    # JavaScript modules
│   ├── firebase-config.js
│   ├── load-trackr-jobs.js
│   ├── load-hackathons.js
│   └── load-site-content.js
├── data/                  # Daily scraped JSON
│   ├── jobs_latest.json
│   ├── hackathons_latest.json
│   └── scholarships_latest.json
├── .github/workflows/     # GitHub Actions
│   └── daily-scrape.yml
├── trackr_scraper_final.py
├── luma_api_scraper.py
├── ucas_scraper.py
└── firebase.json
```

## 🔧 **Local Development**

1. **Clone the repo**
   ```bash
   git clone https://github.com/Mhmiah8/StudentStack.git
   cd StudentStack
   ```

2. **Set up Firebase**
   - Copy `firebase-config.example.js` to `firebase-config.js`
   - Add your Firebase config

3. **Run locally**
   ```bash
   python -m http.server 8000
   # Visit http://localhost:8000/code.html
   ```

## 🤖 **Automated Scrapers**

Three scrapers run daily at 6 AM UTC via GitHub Actions:

- **Trackr Scraper** - 800+ tech jobs
- **Luma Scraper** - UK hackathons
- **UCAS Scraper** - 900+ scholarships

Data automatically commits back to the repo.

## 👑 **User Roles & Permissions**

| Role | Permissions |
|------|-------------|
| **User** | Upload notes, create team posts, set notifications |
| **Mod** | Verify notes, manage reports, remove content |
| **Admin** | Grant mod status, ban users, full access |

## 📝 **Environment Variables**

Create a `.env` file for local scraper development:
```env
TRACKR_SEASON=2026
UCAS_PAGES=5
LUMA_LATITUDE=51.50853
LUMA_LONGITUDE=-0.12574
```

## 🤝 **Contributing**

Want to add a feature or fix a bug? 
1. Fork the repo
2. Create a branch
3. Submit a PR

## 📄 **License**

MIT © StudentStack

## 🙏 **Acknowledgments**

- Data sourced from Trackr, Luma, and UCAS
- Built for CS students, by students
```
