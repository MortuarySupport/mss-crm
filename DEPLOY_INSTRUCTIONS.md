# MSS CRM — Deploy to Netlify
## Step-by-step guide (takes about 10 minutes)

---

## PART 1 — Install Node.js (if not already installed)

1. Go to https://nodejs.org
2. Download the **LTS version**
3. Install it (click through all defaults)
4. Open Terminal (Mac) or Command Prompt (Windows)
5. Verify: type `node --version` — you should see a number like v20.x.x

---

## PART 2 — Build the app on your computer

1. **Download this entire MSS_Deploy folder** to your computer
   (e.g. save it to your Desktop)

2. **Open Terminal / Command Prompt**

3. **Navigate to the folder:**
   ```
   cd Desktop/MSS_Deploy
   ```

4. **Install dependencies:**
   ```
   npm install
   ```
   (This downloads required packages — takes 1-2 minutes)

5. **Build the app:**
   ```
   npm run build
   ```
   (This creates a `dist` folder — this is what gets deployed)

---

## PART 3 — Deploy to Netlify (free)

1. Go to **https://netlify.com**
2. Click **Sign up** — use your email or Google account (free)
3. Once logged in, click **"Add new site"** → **"Deploy manually"**
4. **Drag and drop the `dist` folder** into the upload area
5. Netlify will give you a URL like: `https://random-name-123.netlify.app`

---

## PART 4 — Give it a custom name (optional)

1. In Netlify, go to **Site settings** → **General**
2. Click **Change site name**
3. Type something like `mss-mortuary-crm`
4. Your URL becomes: `https://mss-mortuary-crm.netlify.app`

---

## PART 5 — Embed on your Wix website

1. Open your Wix site editor at **mortuarysupport.com.au**
2. Click **Add** → **Embed** → **HTML iFrame**
3. Click the iFrame element → **Enter Code**
4. Paste this (replace YOUR-URL with your Netlify URL):

```html
<iframe
  src="https://YOUR-URL.netlify.app"
  width="100%"
  height="900px"
  frameborder="0"
  style="border:none; border-radius:12px;"
></iframe>
```

5. Publish your Wix site
6. Done! The CRM now appears on your page.

---

## PART 6 — Updating the app in future

When you want to update (after making changes here in Claude):
1. Download the new `MSS_CRM.jsx` file
2. Replace `src/App.jsx` in your MSS_Deploy folder with it
3. Run `npm run build` again
4. Drag the new `dist` folder to Netlify → **Deploy manually**
   
That's it — updates take about 2 minutes.

---

## Troubleshooting

- **"npm not found"** → Node.js not installed, redo Part 1
- **"dist folder not found"** → Run `npm run build` first
- **Blank white page in Wix** → Make sure the iFrame height is at least 800px
- **Login doesn't work** → Check Netlify URL is correct in the iFrame src
