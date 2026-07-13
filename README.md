# 🌉 SF Trip Dashboard

A single, phone-friendly page that centralizes my San Francisco trip: events I registered for on
**Luma** (pulled automatically) plus **manually-added** events (AMD AI Summit, museums, …).
Hosted free on GitHub Pages, rebuilt automatically by GitHub Actions.

## How it works

```
Luma iCal feed (secret URL) ─┐
                             ├─► build.js ─► public/index.html ─► GitHub Pages
events.json (manual events) ─┘   (merge, sort, group by day, times in Pacific)
```

The build runs in CI, so the Luma feed URL stays a secret and there's no CORS problem and no
server to run. The output is one self-contained static HTML file.

## Local development

```bash
npm install
# Optional: pull your real Luma events too (see "Getting the Luma URL" below)
export LUMA_ICS_URL="https://api.lu.ma/ics/get?entity=...&token=..."
npm run build
open public/index.html
```

Without `LUMA_ICS_URL` set, it builds from `events.json` only — handy for a quick preview.

Inspect the raw Luma feed to check field names: `npm run probe` (needs `LUMA_ICS_URL`).

## Adding / editing manual events

Edit **`events.json`** — an array of objects. Times are Pacific wall-clock (no timezone suffix):

```json
{
  "title": "AMD AI Summit",
  "start": "2026-07-22T09:00",
  "end":   "2026-07-22T17:00",
  "location": "San Jose, CA",
  "url": "https://...",
  "category": "conference",
  "notes": "Registered"
}
```

Only `title` and `start` are required. Commit the change (GitHub's mobile web editor works from
your phone) — the push triggers a rebuild and the page updates within a couple of minutes.

## Getting the Luma feed URL

Luma → your calendar → **Add iCal Subscription** → copy the raw feed URL
(`https://api.lu.ma/ics/get?entity=...&token=...`). This is your personal feed of every event
you've registered for. **Treat it as a password** — anyone with it can read your calendar.

## One-time GitHub setup

1. Create a repo and push this folder (`node_modules/` and `public/` are gitignored;
   **commit `package-lock.json`** so `npm ci` works).
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   name `LUMA_ICS_URL`, value = your feed URL.
3. Repo → **Settings → Pages → Source: GitHub Actions**.
4. Actions tab → run **Build & Deploy SF Trip** (or push any change). The deployed URL appears in
   the workflow summary. Open it on your phone and bookmark it.

## Notes

- The page shows all times in `America/Los_Angeles` regardless of device timezone.
- Scheduled builds run every 3h and can lag ~10–15 min; a manual **workflow_dispatch** forces a
  fresh build immediately. Scheduled workflows auto-pause after 60 days of repo inactivity.
- The Pages URL is public/unlisted — anyone with the link can see the itinerary.
- If a manual event also shows up in the Luma feed, remove it from `events.json` (no auto-dedup).
- Future ideas: a map with geocoded venues; a password gate.
