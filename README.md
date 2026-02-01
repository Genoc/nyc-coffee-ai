# NYC Coffee AI

React + Vite app: AI cashier (Gemini), customer ordering (text/voice), barista queue, and owner dashboard. Orders are stored in a **Google Sheet** via a small Node backend.

## API keys & credentials

You need **two** things: a **Gemini API key** (for the AI cashier) and **Google Sheets access** via a **service account** (for storing orders). Neither is a “Sheets API key” — Sheets uses the service account JSON.

---

### 1. Gemini (AI cashier)

| What | Env variable | Where it’s used |
|------|----------------|------------------|
| API key | `VITE_GEMINI_API_KEY` | Frontend (Vite bakes it in at build time) |

**How to get it**

1. Open [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in with your Google account.
3. Click **Create API key** (use an existing project or create one).
4. Copy the key.

**How to set it**

- **Local:** In the project root, create a file `.env` and add:
  ```bash
  VITE_GEMINI_API_KEY=your_key_here
  ```
- **Railway:** In your service → **Variables** → add `VITE_GEMINI_API_KEY` and paste the key. Rebuild so the new value is embedded in the frontend.

---

### 2. Google Sheets (orders backend)

| What | Env variable | Where it’s used |
|------|----------------|------------------|
| Spreadsheet ID | `GOOGLE_SHEET_ID` | Server only |
| Service account JSON | `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Server only |

**How to get them**

**A. Create the sheet**

1. Create a new [Google Sheet](https://sheets.google.com).
2. Rename the **first tab** to exactly **Orders**.
3. From the URL copy the **sheet ID**:
   - URL looks like: `https://docs.google.com/spreadsheets/d/ABC123xyz/edit`
   - `ABC123xyz` is your **GOOGLE_SHEET_ID**.

**B. Create a service account (so the server can edit the sheet)**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the **Google Sheets API**: APIs & Services → **Library** → search “Google Sheets API” → **Enable**.
3. Go to **APIs & Services** → **Credentials** → **Create credentials** → **Service account**.
4. Give it a name (e.g. “nyc-coffee-sheets”), finish creation.
5. Open the new service account → **Keys** → **Add key** → **Create new key** → **JSON** → download the file.
6. Open the JSON file. It contains `client_email` (e.g. `something@project.iam.gserviceaccount.com`) and a `private_key`.
7. **Share the Google Sheet** with that email: open the sheet → **Share** → add the `client_email` as **Editor**.

**C. Turn the JSON into one string**

The server expects the **entire** JSON file as a **single string** (no newlines, or escaped).

- **Option 1 — Minify:** Copy the whole JSON and remove line breaks so it’s one line, e.g.  
  `{"type":"service_account","project_id":"my-project",...}`  
  Use that as the value of `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

- **Option 2 — From a file (local only):**  
  You can set the env from the file, e.g. in a shell:  
  `export GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat path/to/key.json)"`

**How to set them**

- **Local:** In `.env` (project root):
  ```bash
  VITE_GEMINI_API_KEY=your_gemini_key

  GOOGLE_SHEET_ID=your_sheet_id_from_url
  GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
  ```
  For the JSON, use the single-line minified string. If your shell strips quotes, you may need to escape or put the JSON in a file and `export` as above.

- **Railway:** In the service **Variables** tab add:
  - `GOOGLE_SHEET_ID` = the sheet ID from the URL.
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` = the whole JSON as one line (paste the minified JSON).  
  Railway allows multi-line values; if you paste the pretty-printed JSON, that’s usually fine. If you get parse errors, use a single-line minified JSON.

**Optional: header row**

To make the Orders sheet readable, add a header row (row 1) with:  
`customerName`, `status`, `created_at`, `completed_at`, `subtotal`, `tax`, `grand_total`, `items`  
Or run once (with the same env vars set):  
`node server/init-sheet.js`

---

## Install and run

```bash
npm install
```

**Development** (two terminals):

- Terminal 1: `npm run dev:server` — API on port 3001
- Terminal 2: `npm run dev` — Vite dev server (proxies `/api` to 3001)

**Production (e.g. Railway):**

- Build: `npm run build`
- Start: `npm run start` (serves `dist/` and `/api` from the same server)

Set `NODE_ENV=production` and the env vars above.

---

## Deploy on Railway

Yes — Railway deploys from a **Git repo** (GitHub or GitLab). Do the following.

### 1. Make it a Git repo and push to GitHub

If the project is not yet a repo:

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a new repo on [GitHub](https://github.com/new) (do **not** add a README or .gitignore if you already have one). Then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

(Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.)

If it’s already a repo, just ensure everything is committed and pushed to GitHub.

### 2. Create a Railway project and connect the repo

1. Go to [railway.app](https://railway.app) and sign in (e.g. with GitHub).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select the repo (e.g. `nyc-coffee-ai`). Railway will create a project and a service from that repo.
4. Leave **Root Directory** blank (project root is fine).
5. Railway will detect Node and run `npm install`. Set the commands:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`
   - **Watch Paths:** leave default (or blank).
6. Under the service, open **Variables** and add (same as your local `.env`):
   - `VITE_GEMINI_API_KEY` — your Gemini API key
   - `GOOGLE_SHEET_ID` — spreadsheet ID from the sheet URL
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` — full service account JSON (one line or multi-line; Railway accepts both)
   - Railway sets `NODE_ENV=production` and `PORT` automatically; you don’t need to add them.

7. (Optional) Under **Settings** → **Networking** → **Generate Domain** to get a public URL.

### 3. Deploy

- The first deploy runs when you connect the repo. Later, every push to the connected branch (e.g. `main`) triggers a new deploy.
- After the build finishes, open the generated URL. The app (frontend + `/api/orders`) is served by the same process.

### Summary

| Step | What to do |
|------|------------|
| 1 | `git init` (if needed), commit, push to GitHub |
| 2 | Railway → New Project → Deploy from GitHub repo → select repo |
| 3 | Set **Build:** `npm run build`, **Start:** `npm run start` |
| 4 | Add variables: `VITE_GEMINI_API_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` |
| 5 | Generate domain (optional) and open the URL |
