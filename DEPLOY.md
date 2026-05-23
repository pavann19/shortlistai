# 🚀 Deployment Guide — AI Career Copilot & ATS Tracker

This is a **fully static, client-side application** (HTML + CSS + JS). No build step, no backend, no database server required. Deploying is as simple as uploading the files.

---

## Option 1: Vercel (Recommended — Fastest)

Vercel offers free hosting with instant global CDN, HTTPS, and automatic deployments from Git.

### Steps:

1. **Push your code to GitHub:**
   ```bash
   cd d:\ATS
   git init
   git add .
   git commit -m "Initial commit - ATS Career Copilot"
   git remote add origin https://github.com/YOUR_USERNAME/ats-career-copilot.git
   git push -u origin main
   ```

2. **Go to [vercel.com](https://vercel.com)** → Sign in with GitHub.

3. **Click "Add New Project"** → Import your repository.

4. **Framework Preset:** Select `Other` (no framework needed).

5. **Click Deploy.** Your site will be live at `https://ats-career-copilot.vercel.app` within 30 seconds.

6. **Custom Domain (Optional):** Go to Project Settings → Domains → Add your domain.

> **Note:** Every `git push` to `main` will automatically redeploy.

---

## Option 2: Netlify (Drag & Drop)

### Steps:

1. Go to [app.netlify.com](https://app.netlify.com) → Sign up / Log in.

2. Click **"Add new site"** → **"Deploy manually"**.

3. **Drag and drop the entire `ATS` folder** into the upload area.

4. Your site will be live at a random URL like `https://random-name.netlify.app`.

5. **Rename:** Go to Site Settings → Change site name to something memorable.

### Via Git (Automatic Deploys):
- Same as Vercel: connect your GitHub repo, set `Build command` to empty, and `Publish directory` to `.` (root).

---

## Option 3: GitHub Pages (Free, Git-Integrated)

### Steps:

1. **Push your code to GitHub** (same as Step 1 in Vercel instructions above).

2. Go to your repository on GitHub → **Settings** → **Pages**.

3. Under **Source**, select:
   - **Branch:** `main`
   - **Folder:** `/ (root)`

4. Click **Save**. Your site will be live at:
   ```
   https://YOUR_USERNAME.github.io/ats-career-copilot/
   ```

5. It may take 1-2 minutes for the first deployment.

> **Note:** GitHub Pages only serves static files. All features (localStorage, PDF.js, WebLLM) work perfectly.

---

## Option 4: Local Access (Offline)

For completely offline/local usage:

### Quick Start:
1. Double-click `start-ats.bat` in the project root.
2. Your browser will auto-open at `http://127.0.0.1:8080`.

### Manual Start:
```bash
cd d:\ATS
npx -y http-server -p 8080 -o -c-1
```

### Desktop Shortcut:
1. Right-click on your Desktop → **New** → **Shortcut**.
2. Set the target to: `"d:\ATS\start-ats.bat"`
3. Name it: **ATS Career Copilot**
4. Double-click anytime to launch!

---

## Files Required for Deployment

Only these files need to be deployed:

```
ATS/
├── index.html          (Main application)
├── styles.css          (Stylesheet)
├── app.js              (Application logic)
├── start-ats.bat       (Local launcher - optional)
├── DEPLOY.md           (This guide - optional)
└── chrome-extension/   (Optional - for Chrome extension)
    ├── manifest.json
    ├── content.js
    ├── popup.html
    └── popup.js
```

> The `chrome-extension/` folder is NOT needed for the web app deployment. It's only needed if you want to install the Chrome scraper extension separately.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page | Check browser console (F12) for errors. Ensure all 3 files (html, css, js) are uploaded. |
| PDF upload not working | PDF.js is loaded via CDN. Ensure internet access or download the JS file locally. |
| WebLLM not loading | Requires WebGPU-compatible browser (Chrome 113+). Check `chrome://gpu` for support. |
| localStorage not persisting | Check if browser is in incognito/private mode. Data is stored per-domain. |
