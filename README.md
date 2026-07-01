# Kyrovia

Kyrovia is a React + Express workspace with Google sign-in and a persistent Playwright browser that uses ChatGPT in the backend.

No OpenAI API key is required. The backend opens `chatgpt.com`, you sign in once, and Playwright reuses the saved profile in `backend/playwright-profile`.

## Local setup

1. Install dependencies and Chromium:

   ```powershell
   npm run install:all
   npm --prefix backend run playwright:install
   ```

2. Copy the environment templates:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env
   ```

3. Configure `backend/.env`:

   - Generate a long random `JWT_SECRET`.
   - Configure Firebase Admin with `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT_JSON`.
   - Set `GOOGLE_CSE_ID` and `GOOGLE_CSE_URL` for Computer mode.
   - Keep `PLAYWRIGHT_HEADLESS=false` for the saved ChatGPT session. Kyrovia starts the browser minimized, and you can restore it from the Windows taskbar when sign-in or account changes are needed.

4. Configure `frontend/.env` with the Firebase Web App values.

5. Enable Google in Firebase Authentication and add `localhost` to Firebase Authorized Domains.

6. Start both services:

   ```powershell
   npm run dev:backend
   npm run dev:frontend
   ```

7. A Chromium window opens at ChatGPT. Complete the ChatGPT login there.

Computer mode uses the configured Google Programmable Search Engine. The current public engine URL is:

`https://cse.google.com/cse?cx=51d428a833f454b3a`

## How login works

- Google login authenticates visitors to Kyrovia.
- Username/password login is not supported.
- The backend ChatGPT login is a separate, shared browser session.
- Kyrovia can process up to 10 different account/session conversations in parallel, with one temporary browser tab per active request.
- Requests from the same account/session conversation stay ordered so simultaneous clicks cannot mix replies into the wrong chat.
- Kyrovia keeps a separate conversation URL for each Kyrovia account, login session, and conversation.
- ChatGPT cookies remain in `backend/playwright-profile`.
- Do not commit or share that profile. It contains sensitive session data.
- If ChatGPT signs out or requests verification, complete it again in the backend Chromium window.

There is no supported method to silently bypass ChatGPT authentication or verification. Automatic login here means reusing a legitimate saved browser session.

## LaTeX support

Chat messages support inline and display math with `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and fenced `math` blocks. Supported advanced structures include aligned equations, matrices, arrays, cases, integrals, sums, limits, annotations, and equation tags.

Kyrovia also provides common macros such as `\RR`, `\NN`, `\ZZ`, `\QQ`, `\CC`, `\dd`, `\dv`, `\pdv`, `\abs`, `\norm`, `\set`, `\bra`, `\ket`, `\braket`, and `\unit`. Chemistry and physical-unit notation are available through `\ce{...}` and `\pu{...}`.

The renderer supports KaTeX-compatible mathematical LaTeX, not complete document-level LaTeX commands such as `\documentclass`, page layouts, or arbitrary packages.

## WhatsApp AI Bridge

Kyrovia can pair a WhatsApp session through Baileys, which uses the WhatsApp Web protocol. Open the WhatsApp AI Bridge from Kyrovia Labs or Apps, scan the QR from WhatsApp Linked devices, and incoming private messages are sent to the backend ChatGPT browser service. Kyrovia then replies to the same sender on WhatsApp.

Each signed-in Firebase account receives a separate Baileys socket, QR/status state, and hashed authentication directory under `WHATSAPP_AUTH_DIR/accounts`. One user's linked WhatsApp account is never returned by another user's WhatsApp endpoints.

Useful backend settings:

```powershell
WHATSAPP_AUTH_DIR=./data/whatsapp-auth
WHATSAPP_AUTO_REPLY=true
WHATSAPP_REPLY_GROUPS=false
```

Keep `WHATSAPP_REPLY_GROUPS=false` unless you explicitly want Kyrovia to answer inside group chats.

## Health Balance Lab

Kyrovia Labs includes Health Balance Lab for wellness planning from user-entered or imported health data. The backend stores a per-user health profile with Health Connect, Google Fit, smart watch, and fitness band connection records; daily metrics; medicines; checkups; reminders; charts; doctor-specialty suggestions; and generated routine plans.

Health profiles are stored by Firebase UID. Existing email-keyed profiles are migrated to that UID when the account next opens Health Balance Lab.

When an existing approved Google Fit REST project is configured, opening Health Balance Lab automatically starts the one-time Google consent flow. After consent, Kyrovia encrypts the refresh token in backend storage, imports up to 30 days of steps, calories burned, and active minutes, refreshes stale data whenever the lab opens, and produces activity-based suggestions. Tokens are never returned to the frontend.

Google stopped accepting new Google Fit API registrations on May 1, 2024 and is deprecating the APIs in 2026. This integration is therefore for existing approved projects. Health Connect is the recommended Android migration path, but it requires a native Android companion because Health Connect data is stored on the user's device and cannot be read directly by this React web app.

Existing approved Google Fit projects can configure:

```powershell
GOOGLE_FIT_CLIENT_ID=...
GOOGLE_FIT_CLIENT_SECRET=...
GOOGLE_FIT_REDIRECT_URI=http://localhost:5050/api/health/google-fit/callback
GOOGLE_FIT_RETURN_URL=http://localhost:5173
GOOGLE_FIT_SYNC_DAYS=30
GOOGLE_FIT_TOKEN_ENCRYPTION_KEY=replace-with-a-separate-long-random-secret
```

The redirect URI must exactly match the authorized redirect URI in the Google Cloud OAuth client. Fitness activity read access is a sensitive scope and may require Google's OAuth verification for production use.

## Personal Intelligence

Kyrovia keeps the signed-in user's saved workspace as the long-term history source and builds a small, relevant memory context for future chats. The Personal Intelligence screen provides separate controls for:

- using saved chat history as memory;
- analyzing recurring topics and activity patterns;
- predicting likely searches from the user's own recent prompts;
- using optional aggregated phone/app-usage summaries.

Phone-wide app usage is never read silently. Browsers cannot access Android Digital Wellbeing, Android `UsageStatsManager`, iOS Screen Time, or another app's private activity. Users can enter aggregated usage manually, and a permission-based native companion can submit records to `POST /api/chat/device-usage` with `{ "consent": true, "records": [...] }`. Imported records are isolated to the signed-in account and can be removed from the Personal Intelligence screen or with `DELETE /api/chat/device-usage`.

Behavior insights describe observed workspace patterns only. They do not infer sensitive traits, medical conditions, or certainty about the user's intent.

## Production build

```powershell
npm run build
npm start
```

Express serves the built frontend at `http://localhost:5050`.

For the durable public service, use:

```powershell
npm run start:supervised
```

This starts the backend and `https://kyrovia.loca.lt` in a hidden supervisor that restarts either service after a failure. It also verifies the public URL itself, so LocalTunnel 511/502 responses trigger a tunnel reconnect.

The service keeps running after the launch terminal closes. Stop it manually with:

```powershell
npm run stop:supervised
```

## Netlify public frontend

Netlify can publish the React app publicly. The Playwright-powered Express backend should still run on a persistent machine because it needs a saved browser profile, long requests, file storage, and an interactive ChatGPT login.

1. Push this repository to GitHub and create a Netlify site from it.
2. Use the included `netlify.toml`:

   ```text
   Build command: npm run build:netlify
   Publish directory: frontend/dist
   Functions directory: netlify/functions
   ```

3. Add these Netlify environment variables:

   ```text
   VITE_API_URL=https://your-persistent-backend.example.com/api
   VITE_AI_TIMEOUT_MS=3900000
   VITE_GENERATION_STREAM_IDLE_TIMEOUT_MS=25000
   ```

4. On the persistent backend host, set:

   ```text
   PUBLIC_APP_URL=https://your-netlify-site.netlify.app
   CORS_ORIGIN=https://your-netlify-site.netlify.app
   JWT_SECRET=<long-random-secret>
   FIREBASE_SERVICE_ACCOUNT_JSON=<firebase-admin-json>
   PLAYWRIGHT_USER_DATA_DIR=./playwright-profile
   ```

   Generate `JWT_SECRET` with `npm run generate:secret`.

5. Add the Netlify hostname to Firebase Authentication authorized domains.

The frontend calls `GET /api/deployment` before login and shows whether the public app shell is live, whether Express/Playwright is connected, and that no OpenAI API key is required. If `VITE_API_URL` is not set, Netlify returns a JSON fallback explaining that the persistent backend URL is missing instead of serving an HTML page to API calls.

## Render deployment

Render may install Node packages in production mode, which skips frontend dev dependencies such as Vite. Use the dedicated Render script so the frontend build tools are installed before `vite build` runs.

```text
Root Directory: leave empty
Build Command: npm run build:render
Start Command: npm run start
```

This repository also includes `render.yaml` for a Git-backed Render Blueprint. Create a new Blueprint from `sourabhk1967-cmyk/kyrovia` and Render will create the `kyrovia-1` free web service with:

```text
Backend URL: https://kyrovia-1.onrender.com
API URL: https://kyrovia-1.onrender.com/api
Health check: /api/health
```

Netlify's fallback message, `Kyrovia is public on Netlify. Set VITE_API_URL...`, means the frontend was built without a persistent backend URL. The tracked production env now points Netlify builds to:

```text
VITE_API_URL=https://kyrovia-1.onrender.com/api
```

If you override environment variables in Netlify, set the same value there and redeploy the Netlify site.

Set `NODE_VERSION=20`, `NODE_ENV=production`, `PUBLIC_APP_URL`, `CORS_ORIGIN`, `JWT_SECRET`, and Firebase Admin credentials in Render. The Blueprint generates `JWT_SECRET`, but you must paste `FIREBASE_SERVICE_ACCOUNT_JSON` manually in Render because it is a private secret.

Render Free web services are useful for a public demo, but they spin down when idle and lose local filesystem changes on restart. That means ChatGPT browser login/session data, uploaded images, WhatsApp auth, and saved workspaces are not durable on the free tier. For persistent browser/session storage, upgrade to a paid Render service with a disk mounted at `/var/data` and set:

```text
KYROVIA_DATA_DIR=/var/data
PLAYWRIGHT_USER_DATA_DIR=/var/data/playwright-profile
WHATSAPP_AUTH_DIR=/var/data/whatsapp-auth
```

## Cloudflare CDN assets

Set `VITE_CLOUDFLARE_CDN_URL` before building to make the production frontend load compiled JS, CSS, images, and fonts from a Cloudflare-backed CDN/custom domain.

```powershell
$env:VITE_CLOUDFLARE_CDN_URL="https://cdn.example.com/kyrovia/"
npm --prefix frontend run build:cloudflare
```

Upload `frontend/dist/assets` to the same Cloudflare path and keep serving `frontend/dist/index.html` from the backend, Cloudflare Pages, or your web server. Leave `VITE_CLOUDFLARE_CDN_URL` empty for normal local builds.

## Publishing online

This browser mode needs a persistent machine, persistent disk, and usually a desktop session for the first login. Use a Windows/Linux VPS or your own always-on computer with:

- a persistent `backend/playwright-profile` directory;
- HTTPS through a reverse proxy;
- `PLAYWRIGHT_HEADLESS=false` for initial login;
- `PLAYWRIGHT_HEADLESS=true` only after the saved session is confirmed;
- the public hostname added to Firebase Authorized Domains.

Serverless platforms and hosts without an interactive browser are not suitable for the first ChatGPT login. `CHAT_MAX_CONCURRENT_TABS=10` caps parallel browser work, `CHAT_QUEUE_MAX_PENDING` controls the waiting-room size, `CHAT_QUEUE_WAIT_TIMEOUT_MS` controls how long a queued request may wait, and `VITE_AI_TIMEOUT_MS` keeps the frontend connected to long-running queued requests. `PLAYWRIGHT_RECOVER_PROFILE_LOCK=true` lets Kyrovia close stale Chromium processes that are using the exact app-owned `PLAYWRIGHT_USER_DATA_DIR` after an unclean restart. Parallel tabs share the signed-in browser profile but retain separate Kyrovia account/session/conversation mappings.

## Useful endpoints

- `POST /api/auth/firebase`: exchange a Firebase Google token for a Kyrovia session
- `GET /api/auth/me`: validate the Kyrovia session
- `GET /api/chat/status`: check the backend browser and ChatGPT login state
- `POST /api/chat/send`: send a prompt through the backend ChatGPT browser
- `POST /api/search/google`: search through the configured Google Programmable Search Engine
- `GET /api/health/profile`: read the signed-in user's health profile
- `PUT /api/health/profile`: save metrics, medicines, checkups, reminders, and preferences
- `POST /api/health/connect`: mark a Health Connect, Google Fit, smart watch, or fitness band source
- `POST /api/health/import`: import daily fitness metrics into health history
- `POST /api/health/plan`: generate a daily health routine and reminder plan
- `POST /api/health/google-fit/authorize`: start account-scoped Google Fit consent
- `GET /api/health/google-fit/callback`: complete Google OAuth and perform the first sync
- `POST /api/health/google-fit/sync`: sync daily steps, calories, and active minutes
- `POST /api/health/google-fit/disconnect`: revoke and remove the account's stored Google Fit token
- `GET /api/whatsapp/status`: check WhatsApp QR, connection, and auto-reply status
- `POST /api/whatsapp/connect`: start Baileys pairing
- `POST /api/whatsapp/send`: send a WhatsApp test message
- `GET /api/chat/workspace`: read the signed-in user's workspace
- `PUT /api/chat/workspace`: save the signed-in user's workspace
- `GET /api/chat/intelligence`: read behavior insights and predicted searches
- `POST /api/chat/device-usage`: import consented aggregated app-usage records
- `DELETE /api/chat/device-usage`: clear imported app-usage records and revoke usage consent
