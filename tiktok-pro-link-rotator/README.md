# TikTok Pro Link Rotator

A Netlify-hosted, server-side round-robin redirector with Upstash Redis persistence and a password-protected admin dashboard.

## Features
- Atomic round-robin selection in Redis (safe when requests arrive concurrently).
- Persistent per-link and total redirect counters.
- Admin dashboard at `/admin` to add, replace, disable, enable, and delete links.
- HTTP-only signed admin session cookie; password and Redis credentials stay in server environment variables.
- Link URL validation allows HTTPS URLs only.

## Requirements
- GitHub account
- Netlify account
- Upstash Redis database

## 1. Create Upstash Redis
1. Sign in at https://console.upstash.com/ and create a Redis database.
2. Open the database's **REST API** section.
3. Copy the REST URL and REST token. Keep the token private.

## 2. Upload this project to GitHub
1. Download and unzip this project.
2. Create a new GitHub repository (for example `tiktok-pro-rotator`).
3. Upload the *contents* of this folder to the repository root. `netlify.toml`, `package.json`, `README.md`, and `netlify/` should be at the root—not inside an extra nested folder.
4. Do not commit real credentials or a `.env` file.

## 3. Deploy on Netlify
1. In Netlify, choose **Add new site → Import an existing project**.
2. Connect GitHub and select the repository.
3. Build settings:
   - Build command: leave blank (or `npm install` if the UI requires a command).
   - Publish directory: `public`
   - Functions directory: `netlify/functions` (normally detected from `netlify.toml`)
4. Before or immediately after the first deploy, open **Site configuration → Environment variables** and add:
   - `UPSTASH_REDIS_REST_URL` — Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN` — Upstash REST token
   - `ADMIN_PASSWORD` — a long, unique password
   - `ADMIN_SESSION_SECRET` — a random secret, at least 32 bytes
5. Trigger a fresh deploy after setting environment variables. Netlify functions need a redeploy to pick up changed environment variables.

Generate a session secret locally with one of:
- macOS/Linux: `openssl rand -base64 48`
- Node.js: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

## 4. Open the dashboard
Visit `https://YOUR-SITE.netlify.app/admin` and sign in with `ADMIN_PASSWORD`.
Add your TikTok Pro URLs from the dashboard. Use the full `https://...` URL. Do not add secrets or credentials to URLs.

## 5. Test
1. Add at least two HTTPS links and ensure both are enabled.
2. Open the site root (`https://YOUR-SITE.netlify.app/`) several times. Each request should redirect to the next enabled link in round-robin order.
3. Refresh `/admin` and confirm per-link and total counts increase.
4. Disable a link and verify it is skipped. Re-enable it to include it again.
5. Replace a link URL and confirm the next redirects use the new URL.
6. Delete a test link and confirm it disappears.
7. Test a private browser window or another device to confirm the dashboard requires a password.
8. If you see a configuration error, inspect Netlify → Functions → function logs and verify all four environment variables.

## Behavior and notes
- Only enabled links participate in rotation.
- Counts are incremented atomically with the selection, before the redirect response is returned.
- A browser/client that follows redirects may cache or prefetch in unusual ways; the server counts each request reaching the redirect function, not unique humans.
- A redirect request cannot guarantee the destination platform will attribute a visit, signup, or reward.
- This tool rotates supplied links and records server requests; it does not create accounts, bypass platform limits, or guarantee referral credit.
- Keep dependencies updated and rotate credentials if you suspect exposure.
