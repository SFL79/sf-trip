# CLAUDE.md — SF Trip Dashboard

Guidance for AI agents working on this project.

## What this is

A single, phone-friendly web page centralizing a San Francisco trip itinerary. It merges two
sources into one timeline + interactive map:

1. **Luma events** — pulled live from a personal iCal feed (every event the owner registered for).
2. **Manual events** — hand-added items (conferences, museums, tours) in `events.json`.

It's a **static site** built by a Node script and deployed to **GitHub Pages**, rebuilt
automatically by **GitHub Actions** on a 10-minute schedule (and on every push).

- **Live URL:** https://sfl79.github.io/sf-trip/
- **Repo:** https://github.com/SFL79/sf-trip (public)

## Architecture / data flow

```
Luma iCal feed (secret URL) ─┐
                             ├─► build.js ──► render.js ──► public/index.html ──► GitHub Pages
events.json (manual events) ─┘   (fetch + parse ics, merge, sort, group by day, build map pins)
```

Why build-time (not client-side) fetch: the Luma feed URL is a **secret token** (anyone with it
can read the calendar) and Luma's `.ics` endpoint sends no CORS headers. Fetching in CI keeps the
token server-side and sidesteps CORS. A live client-side fetch was considered and rejected for
these reasons; the chosen tradeoff was a frequent rebuild instead. See "Live-updates decision".

## Files

| File | Role |
|------|------|
| `build.js` | Entry point. Fetches Luma feed (`node-ical`), loads `events.json`, merges, assigns ids, groups by day, builds map `pins`, writes `public/index.html`. |
| `render.js` | Pure HTML/CSS/JS template. `renderPage()` + `renderMap()` + per-event card. All CSS inline; Leaflet loaded from CDN. |
| `events.json` | The ONLY hand-maintained data. Array of manual events (schema below). |
| `.github/workflows/deploy.yml` | Build + deploy to Pages. Triggers: push to main, `schedule` (every 10 min), `workflow_dispatch`. |
| `public/` | Build output (gitignored). Regenerated every build. |

## Manual event schema (`events.json`)

```json
{
  "title": "AMD Advancing AI (AI Summit)",
  "start": "2026-07-22T09:00",          // Pacific wall-clock, NO timezone suffix
  "end":   "2026-07-22T17:00",          // optional
  "location": "Moscone West, 747 Howard St, San Francisco, CA",
  "url": "https://...",                  // optional; makes title + popup link clickable
  "category": "conference",              // free text; shown as a badge
  "notes": "Registered · runs July 22–23",
  "lat": 37.78406,                        // optional; REQUIRED for a map pin
  "lon": -122.40145
}
```

- Only `title` and `start` are required.
- **No `lat`/`lon` → no map pin, no "Show in map" / Directions buttons** (used for TBD locations).
- Grab coords by right-clicking a spot in Google Maps.
- Times render in `America/Los_Angeles` regardless of viewer/CI timezone (via luxon). This is the
  main correctness trap — always give Pacific wall-clock times.

## Local development

```bash
npm install
export LUMA_ICS_URL="<the secret Luma feed URL>"   # optional; omit to build manual events only
npm run build        # -> public/index.html
open public/index.html
npm run probe        # dumps the raw parsed Luma feed (needs LUMA_ICS_URL) for debugging field mapping
```

The Luma feed URL is **not** stored in the repo. It lives only as the `LUMA_ICS_URL` GitHub Actions
secret. Get it from the owner (Luma → calendar → Add iCal Subscription → copy raw URL) when needed
locally. **Never commit it or print it into `public/`.** Grep-check staged files before every push for the
feed host — `git grep --cached -l "api.luma.com/ics"` should return nothing.

## Deploy

Every push to `main` (and the 10-min cron) runs `.github/workflows/deploy.yml`, which builds with
the secret and publishes to Pages. To force an immediate refresh: repo → Actions → "Build & Deploy
SF Trip" → Run workflow. Editing `events.json` and pushing also deploys.

Standard loop after any change:
```bash
node build.js && git add -A && git commit -m "..." && git push
# then: gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

## Map features (all in `render.js`)

- **Pins:** Leaflet + OpenStreetMap tiles (no API key). Each pin is a colored badge showing the
  **July date number**. Color = source: purple (`--luma`) = Luma, green (`--manual`) = manual.
- **Popups:** title, time, address, 🧭 Directions (Google Maps `dir` URL to the coords), Open ↗.
- **"You are here":** live 🧍 marker via browser Geolocation (`watchPosition`) + accuracy circle +
  a 📍 recenter control. HTTPS-only (works on Pages, not `file://`). Purely client-side; the
  location is never sent anywhere.
- **"📍 Show in map" button** on each located event card → `window.focusPin(id)` scrolls to the
  map, zooms to the pin, opens its popup, and pulses the badge.

## Gotchas / lessons learned

- **Leaflet SRI hashes:** the `<script>`/`<link>` `integrity` attrs must exactly match the CDN
  files or the browser silently blocks Leaflet and the map goes blank. Verify with:
  `curl -sL https://unpkg.com/leaflet@1.9.4/dist/leaflet.js | openssl dgst -sha256 -binary | openssl base64 -A`
- **Luma has no `URL` property** on VEVENTs; the event link is extracted from the description
  (`https://luma.com/...`). Luma DOES provide `geo` (lat/lon) — used for Luma pins automatically.
- **No dedup:** if a manual event also appears in the Luma feed, remove it from `events.json`.
- **Scheduled Actions** can lag a few minutes and auto-pause after 60 days of repo inactivity.

## Conventions

- Keep everything **self-contained** in `render.js` (inline CSS, minimal JS); no build framework.
- Match existing code style; keep the page mobile-first and theme-aware (light/dark).
- Commit messages: imperative, one line, with the Claude Code co-author trailer.

## Live-updates decision (context for future changes)

The owner asked about live client-side Luma fetching to avoid rebuilds. Chosen solution: **rebuild
every 10 minutes** (free on public repos, token stays server-side, ~1-line cron). The alternative —
a Cloudflare Worker proxy holding the token and returning JSON with CORS, plus moving rendering to
the browser — remains the path to true instant updates if ever requested.
