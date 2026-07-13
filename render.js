// Renders the trip dashboard as a single self-contained HTML string.
// All times are already luxon DateTime objects in America/Los_Angeles.

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeRange(ev) {
  const start = ev.start.toFormat("h:mm a");
  if (!ev.end) return start;
  // Same-day end → just show end time; multi-day → show end date too.
  const sameDay = ev.end.hasSame(ev.start, "day");
  const end = ev.end.toFormat(sameDay ? "h:mm a" : "LLL d, h:mm a");
  return `${start} – ${end}`;
}

function badge(ev) {
  const label = ev.source === "luma" ? "Luma" : ev.category || "manual";
  return `<span class="badge badge-${esc(ev.source)}">${esc(label)}</span>`;
}

function renderEvent(ev) {
  const title = ev.url
    ? `<a class="title" href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.title)}</a>`
    : `<span class="title">${esc(ev.title)}</span>`;
  const loc = ev.location
    ? `<div class="meta loc">📍 ${esc(ev.location)}</div>`
    : "";
  const notes = ev.notes ? `<div class="meta notes">${esc(ev.notes)}</div>` : "";
  return `
      <li class="event">
        <div class="time">${esc(timeRange(ev))}</div>
        <div class="body">
          <div class="head">${title}${badge(ev)}</div>
          ${loc}${notes}
        </div>
      </li>`;
}

function renderDay(day) {
  return `
    <section class="day">
      <h2>${esc(day.dayLabel)}</h2>
      <ul class="events">${day.events.map(renderEvent).join("")}</ul>
    </section>`;
}

export function renderPage({ days, total, updatedAt }) {
  const body =
    days.length === 0
      ? `<p class="empty">No events yet. Add some to <code>events.json</code> or set <code>LUMA_ICS_URL</code>.</p>`
      : days.map(renderDay).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>SF Trip</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #fff; --text: #1a1c1e; --muted: #6b7280;
    --line: #e5e7eb; --accent: #2563eb; --luma: #7c3aed; --manual: #059669;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115; --card: #1a1d23; --text: #e8eaed; --muted: #9aa0a6;
      --line: #2a2e35; --accent: #60a5fa; --luma: #a78bfa; --manual: #34d399;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) 3rem env(safe-area-inset-left);
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 1.25rem 1rem 0; }
  header h1 { margin: 0 0 .15rem; font-size: 1.6rem; }
  header .sub { color: var(--muted); font-size: .85rem; margin-bottom: 1.5rem; }
  .day { margin-bottom: 1.75rem; }
  .day h2 {
    position: sticky; top: 0; z-index: 1; margin: 0 0 .6rem;
    padding: .5rem 0; font-size: 1.05rem; letter-spacing: .01em;
    background: var(--bg); border-bottom: 1px solid var(--line);
  }
  ul.events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .6rem; }
  .event {
    display: flex; gap: .85rem; background: var(--card);
    border: 1px solid var(--line); border-radius: 12px; padding: .8rem .9rem;
  }
  .time {
    flex: 0 0 auto; min-width: 5.5rem; font-variant-numeric: tabular-nums;
    font-size: .82rem; color: var(--muted); padding-top: .1rem;
  }
  .body { flex: 1 1 auto; min-width: 0; }
  .head { display: flex; align-items: baseline; gap: .5rem; flex-wrap: wrap; }
  .title { font-weight: 600; color: var(--text); text-decoration: none; }
  a.title:hover { color: var(--accent); text-decoration: underline; }
  .meta { color: var(--muted); font-size: .82rem; margin-top: .2rem; word-break: break-word; }
  .badge {
    font-size: .68rem; text-transform: uppercase; letter-spacing: .04em;
    padding: .12rem .4rem; border-radius: 999px; color: #fff; white-space: nowrap;
  }
  .badge-luma { background: var(--luma); }
  .badge-manual { background: var(--manual); }
  .empty { color: var(--muted); }
  footer { color: var(--muted); font-size: .78rem; text-align: center; margin-top: 2rem; }
  code { background: var(--card); padding: .1rem .3rem; border-radius: 4px; border: 1px solid var(--line); }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>🌉 SF Trip</h1>
      <div class="sub">${esc(total)} events · times in Pacific · updated ${esc(updatedAt)}</div>
    </header>
    ${body}
    <footer>Built from Luma + events.json</footer>
  </div>
</body>
</html>`;
}
