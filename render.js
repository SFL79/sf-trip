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
  const mapBtn =
    typeof ev.lat === "number" && typeof ev.lon === "number"
      ? `<button type="button" class="map-btn" onclick="focusPin(${ev.id})">📍 Show in map</button>`
      : "";
  return `
      <li class="event">
        <div class="time">${esc(timeRange(ev))}</div>
        <div class="body">
          <div class="head">${title}${badge(ev)}</div>
          ${loc}${notes}${mapBtn}
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

function renderMap(pins) {
  if (!pins || pins.length === 0) return "";
  // Leaflet from CDN; data injected as JSON. Pins colored by source.
  return `
    <div id="map"></div>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      const PINS = ${JSON.stringify(pins)};
      window.addEventListener("load", () => {
        const map = L.map("map", { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        const bounds = [];
        const markersById = {};
        for (const p of PINS) {
          const color = p.source === "luma" ? "#7c3aed" : "#059669";
          const marker = L.circleMarker([p.lat, p.lon], {
            radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1,
          }).addTo(map);
          markersById[p.id] = marker;
          const link = p.url
            ? '<a href="' + p.url + '" target="_blank" rel="noopener">Open ↗</a>'
            : "";
          const dirUrl = "https://www.google.com/maps/dir/?api=1&destination=" + p.lat + "," + p.lon;
          const directions = '<a href="' + dirUrl + '" target="_blank" rel="noopener">🧭 Directions</a>';
          marker.bindPopup(
            "<strong>" + p.title + "</strong><br>" + p.when +
            (p.location ? "<br>" + p.location : "") +
            '<div class="popup-links">' + directions + (link ? " · " + link : "") + "</div>"
          );
          bounds.push([p.lat, p.lon]);
        }
        if (bounds.length === 1) map.setView(bounds[0], 14);
        else map.fitBounds(bounds, { padding: [40, 40] });

        // --- "Show in map" from an event card: scroll to map, focus + pulse the pin ---
        window.focusPin = function (id) {
          const m = markersById[id];
          if (!m) return;
          document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "start" });
          map.setView(m.getLatLng(), 15, { animate: true });
          m.openPopup();
          let on = false, ticks = 0;
          const iv = setInterval(() => {
            m.setRadius(on ? 8 : 15);
            m.setStyle({ weight: on ? 2 : 4 });
            on = !on;
            if (++ticks >= 6) { clearInterval(iv); m.setRadius(8); m.setStyle({ weight: 2 }); }
          }, 250);
        };

        // --- Live "you are here" marker (browser geolocation) ---
        let meMarker = null, meCircle = null, firstFix = true;
        function onPosition(pos) {
          const { latitude: lat, longitude: lon, accuracy } = pos.coords;
          if (!meMarker) {
            const meIcon = L.divIcon({
              className: "me-icon",
              html: "<div class='me-badge'>🧍</div>",
              iconSize: [34, 34],
              iconAnchor: [17, 17],
              popupAnchor: [0, -18],
            });
            meMarker = L.marker([lat, lon], { icon: meIcon, zIndexOffset: 1000 })
              .addTo(map).bindPopup("You are here");
            meCircle = L.circle([lat, lon], { radius: accuracy, color: "#2563eb", weight: 1, fillOpacity: 0.08 }).addTo(map);
          } else {
            meMarker.setLatLng([lat, lon]);
            meCircle.setLatLng([lat, lon]).setRadius(accuracy);
          }
          if (firstFix) { map.setView([lat, lon], Math.max(map.getZoom(), 13)); firstFix = false; }
        }
        if ("geolocation" in navigator) {
          navigator.geolocation.watchPosition(onPosition, () => {}, {
            enableHighAccuracy: true, maximumAge: 30000, timeout: 20000,
          });
          // "Recenter on me" button
          const Locate = L.Control.extend({
            options: { position: "topleft" },
            onAdd() {
              const b = L.DomUtil.create("a", "leaflet-bar leaflet-control locate-btn");
              b.href = "#"; b.title = "Show my location"; b.innerHTML = "📍";
              L.DomEvent.on(b, "click", (e) => {
                L.DomEvent.preventDefault(e);
                if (meMarker) map.setView(meMarker.getLatLng(), 15);
              });
              return b;
            },
          });
          map.addControl(new Locate());
        }
      });
    </script>`;
}

export function renderPage({ days, total, updatedAt, pins }) {
  const body =
    days.length === 0
      ? `<p class="empty">No events yet. Add some to <code>events.json</code> or set <code>LUMA_ICS_URL</code>.</p>`
      : renderMap(pins) + days.map(renderDay).join("");

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
  #map {
    height: 300px; width: 100%; margin-bottom: 1.75rem;
    border: 1px solid var(--line); border-radius: 12px; background: var(--card);
  }
  .leaflet-popup-content { font: 14px/1.4 -apple-system, sans-serif; }
  .popup-links { margin-top: .4rem; }
  .locate-btn {
    display: flex !important; align-items: center; justify-content: center;
    width: 30px; height: 30px; font-size: 16px; text-decoration: none;
  }
  .me-badge {
    width: 34px; height: 34px; border-radius: 50%;
    background: #2563eb; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; font-size: 18px; line-height: 1;
  }
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
  .map-btn {
    margin-top: .5rem; padding: .3rem .6rem; font-size: .78rem; cursor: pointer;
    color: var(--accent); background: transparent; border: 1px solid var(--line);
    border-radius: 999px; -webkit-tap-highlight-color: transparent;
  }
  .map-btn:hover { border-color: var(--accent); }
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
