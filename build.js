import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ical from "node-ical";
import { DateTime } from "luxon";
import { renderPage } from "./render.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ZONE = "America/Los_Angeles";
const LUMA_ICS_URL = process.env.LUMA_ICS_URL;

// ---------------------------------------------------------------------------
// Luma: fetch the personal iCal feed and map VEVENTs to our event shape.
// The feed URL is a secret (token in the query string); it is read from an
// env var / CI secret and never written into the output.
// ---------------------------------------------------------------------------
async function fetchLumaEvents() {
  if (!LUMA_ICS_URL) {
    console.warn("[build] LUMA_ICS_URL not set — building with manual events only.");
    return [];
  }
  console.log("[build] Fetching Luma iCal feed…");
  const data = await ical.async.fromURL(LUMA_ICS_URL);
  const events = [];
  for (const item of Object.values(data)) {
    if (item.type !== "VEVENT") continue;
    const start = item.start ? DateTime.fromJSDate(item.start).setZone(ZONE) : null;
    if (!start || !start.isValid) continue;
    const end = item.end ? DateTime.fromJSDate(item.end).setZone(ZONE) : null;
    // Luma exposes no URL property; the event link lives in the description
    // ("Get up-to-date information at: https://luma.com/…").
    const desc = (item.description || "").toString();
    const url = (item.url || "").toString().trim() ||
      (desc.match(/https:\/\/luma\.com\/\S+/) || [""])[0].replace(/[).,]+$/, "");
    events.push({
      title: (item.summary || "Untitled event").toString().trim(),
      start,
      end,
      location: (item.location || "").toString().trim(),
      url,
      lat: item.geo?.lat ?? null,
      lon: item.geo?.lon ?? null,
      category: "luma",
      notes: "",
      source: "luma",
    });
  }
  console.log(`[build] Luma events: ${events.length}`);
  return events;
}

// ---------------------------------------------------------------------------
// Manual events from events.json. start/end are LA wall-clock, no tz suffix.
// ---------------------------------------------------------------------------
function loadManualEvents() {
  const raw = readFileSync(join(ROOT, "events.json"), "utf8");
  const list = JSON.parse(raw);
  const events = [];
  for (const e of list) {
    const start = DateTime.fromISO(e.start, { zone: ZONE });
    if (!start.isValid) {
      console.warn(`[build] Skipping manual event with bad start: ${JSON.stringify(e)}`);
      continue;
    }
    const end = e.end ? DateTime.fromISO(e.end, { zone: ZONE }) : null;
    events.push({
      title: (e.title || "Untitled event").trim(),
      start,
      end: end && end.isValid ? end : null,
      location: (e.location || "").trim(),
      url: (e.url || "").trim(),
      lat: typeof e.lat === "number" ? e.lat : null,
      lon: typeof e.lon === "number" ? e.lon : null,
      category: (e.category || "manual").trim(),
      notes: (e.notes || "").trim(),
      source: "manual",
    });
  }
  console.log(`[build] Manual events: ${events.length}`);
  return events;
}

// Group a sorted event list into [{ dayKey, dayLabel, events: [] }].
function groupByDay(events) {
  const groups = new Map();
  for (const ev of events) {
    const key = ev.start.toFormat("yyyy-LL-dd");
    if (!groups.has(key)) {
      groups.set(key, {
        dayKey: key,
        dayLabel: ev.start.toFormat("cccc, LLLL d"),
        events: [],
      });
    }
    groups.get(key).events.push(ev);
  }
  return [...groups.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

async function main() {
  const [luma, manual] = [await fetchLumaEvents(), loadManualEvents()];
  const all = [...luma, ...manual].sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const days = groupByDay(all);

  const pins = all
    .filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
    .map((e) => ({
      title: e.title,
      lat: e.lat,
      lon: e.lon,
      source: e.source,
      url: e.url,
      location: e.location,
      when: e.start.toFormat("ccc LLL d, h:mm a"),
    }));

  const updatedAt = DateTime.now().setZone(ZONE).toFormat("cccc, LLLL d 'at' h:mm a 'PT'");
  const html = renderPage({ days, total: all.length, updatedAt, pins });

  mkdirSync(join(ROOT, "public"), { recursive: true });
  writeFileSync(join(ROOT, "public", "index.html"), html, "utf8");
  console.log(`[build] Wrote public/index.html (${all.length} events across ${days.length} days).`);
}

main().catch((err) => {
  console.error("[build] Failed:", err);
  process.exit(1);
});
