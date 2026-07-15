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
  all.forEach((e, i) => (e.id = i));
  const days = groupByDay(all);

  // A day (and its pins) is "past" once its calendar date is before today (Pacific).
  const today = DateTime.now().setZone(ZONE).startOf("day");
  const isPast = (dt) => dt.startOf("day") < today;

  // Map pins are colored by day so each day's stops read as one cluster.
  // Distinct, light/dark-friendly hues; blue is reserved for the "you are here" marker.
  const PALETTE = [
    "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488",
    "#7c3aed", "#db2777", "#4f46e5", "#65a30d", "#c026d3",
  ];
  const PAST_COLOR = "#9ca3af";
  const dayColorByKey = new Map();
  days.forEach((d, i) => {
    d.past = DateTime.fromISO(d.dayKey, { zone: ZONE }) < today;
    d.color = d.past ? PAST_COLOR : PALETTE[i % PALETTE.length];
    d.dayNum = DateTime.fromISO(d.dayKey, { zone: ZONE }).toFormat("d");
    dayColorByKey.set(d.dayKey, d.color);
  });

  const pins = all
    .filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
    .map((e) => ({
      id: e.id,
      title: e.title,
      lat: e.lat,
      lon: e.lon,
      color: dayColorByKey.get(e.start.toFormat("yyyy-LL-dd")),
      url: e.url,
      location: e.location,
      day: e.start.toFormat("d"),
      when: e.start.toFormat("ccc LLL d, h:mm a"),
      past: isPast(e.start),
    }));

  // Legend: one swatch per day that has a pin, in chronological order.
  const pinnedKeys = new Set(
    all.filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
       .map((e) => e.start.toFormat("yyyy-LL-dd"))
  );
  const dayColors = days
    .filter((d) => pinnedKeys.has(d.dayKey))
    .map((d) => ({ num: d.dayNum, color: d.color, past: d.past }));

  const updatedAt = DateTime.now().setZone(ZONE).toFormat("cccc, LLLL d 'at' h:mm a 'PT'");
  const html = renderPage({ days, total: all.length, updatedAt, pins, dayColors });

  mkdirSync(join(ROOT, "public"), { recursive: true });
  writeFileSync(join(ROOT, "public", "index.html"), html, "utf8");
  console.log(`[build] Wrote public/index.html (${all.length} events across ${days.length} days).`);
}

main().catch((err) => {
  console.error("[build] Failed:", err);
  process.exit(1);
});
