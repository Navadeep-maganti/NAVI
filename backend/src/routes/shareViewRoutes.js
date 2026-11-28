const express = require("express");

const router = express.Router();

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

router.get("/:token", (req, res) => {
  const token = escapeHtml(req.params.token);
  // Allow Leaflet CDN + Socket.IO client script on this standalone viewer page.
  res.removeHeader("Content-Security-Policy");
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NAVI Live Location Share</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; }
    header { padding: 12px 16px; background: #1e293b; display: flex; justify-content: space-between; align-items: center; }
    .badge { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #16a34a; }
    .badge.alert { background: #dc2626; }
    .badge.ended { background: #64748b; }
    #map { height: calc(100vh - 96px); width: 100%; }
    footer { padding: 8px 16px; font-size: 13px; color: #cbd5e1; background: #1e293b; }
  </style>
</head>
<body>
  <header>
    <div><strong id="title">NAVI Live Location</strong></div>
    <span id="statusBadge" class="badge">Connecting...</span>
  </header>
  <div id="map"></div>
  <footer id="details">Loading shared location...</footer>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const token = "${token}";
    const map = L.map("map").setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    let marker = null;

    function updatePosition(loc, name) {
      if (!loc || typeof loc.latitude !== "number") return;
      const latlng = [loc.latitude, loc.longitude];
      if (!marker) {
        marker = L.marker(latlng).addTo(map);
        map.setView(latlng, 16);
      } else {
        marker.setLatLng(latlng);
        map.panTo(latlng);
      }
      document.getElementById("details").textContent =
        (name ? name + " • " : "") +
        "Lat: " + loc.latitude.toFixed(5) + ", Lon: " + loc.longitude.toFixed(5) +
        (loc.speed != null ? " • Speed: " + loc.speed + " m/s" : "") +
        (loc.recordedAt ? " • Updated: " + new Date(loc.recordedAt).toLocaleTimeString() : "");
    }

    fetch("/api/live-share/view/" + encodeURIComponent(token))
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        const badge = document.getElementById("statusBadge");
        if (!ok || !d.success) {
          badge.textContent = "Expired / Inactive";
          badge.className = "badge ended";
          document.getElementById("details").textContent = d.message || "Live share unavailable.";
          return;
        }
        document.getElementById("title").textContent = "NAVI Live — " + d.sharedBy;
        if (d.emergencyStatus && d.emergencyStatus.status === "escalated") {
          badge.textContent = "EMERGENCY ACTIVE";
          badge.className = "badge alert";
        } else {
          badge.textContent = "Live";
          badge.className = "badge";
        }
        updatePosition(d.lastLocation, d.sharedBy);

        const socket = io({ auth: { shareToken: token } });
        socket.on("live-share:location", (loc) => updatePosition(loc, d.sharedBy));
        socket.on("emergency:status", (st) => {
          if (st.status === "escalated") {
            badge.textContent = "EMERGENCY ACTIVE";
            badge.className = "badge alert";
          } else if (st.status === "resolved_safe") {
            badge.textContent = "Resolved Safe";
            badge.className = "badge";
          }
        });
        socket.on("live-share:ended", () => {
          badge.textContent = "Ended";
          badge.className = "badge ended";
        });
      });
  </script>
</body>
</html>`);
});

module.exports = router;
