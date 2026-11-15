/* ============================================================================
 * SELENE//OPS — Planner module
 *  - Sun & Earth sky view (horizon panorama + sky dome) with time to sunset / Earthset
 *  - Power & communications assessment (irradiance, sunlight duration, Earth visibility)
 *  - 2D equirectangular map (LROC WAC mosaic, live day/night, terminator, Earth horizon)
 *  - 30-day Sun/Earth timeline + 12-lunation "seasons" view (click to jump in time)
 *  - Side-by-side / sequential site comparison (up to 4 sites)
 *  - Landing date & time picker + step / jump controls
 *  - Planner vs. Learn audience modes
 * All geometry comes from the same ephemeris as app.js (NASA SVS Dial-A-Moon + Meeus engine).
 * ============================================================================ */
(() => {
  "use strict";
  const S = window.SELENE;
  if (!S) { console.error("planner.js: window.SELENE API from app.js not found"); return; }

  const $ = (id) => document.getElementById(id);
  const d2r = (d) => (d * Math.PI) / 180;
  const r2d = (r) => (r * 180) / Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const HOUR = 3600000, DAY = 86400000;
  const MOON_R_KM = 1737.4;
  const LIT_MIN = 0.5;   // daylight threshold used everywhere in the app (deg)
  const DTE_MIN = 2.0;   // Direct-to-Earth link threshold used everywhere in the app (deg)
  const BACK_H = 16 * 24, FWD_H = 65 * 24;
  const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const COMPASS_WORD = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const cIdx = (az) => Math.round((((az % 360) + 360) % 360) / 45) % 8;
  const fmtSigned = (v, dp = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
  const fmtDate = (ms) => S.fmtDateShort(new Date(ms));

  const state = {
    ctx: null, ser: null, prof: null,
    skyMode: "pano", tlMode: "30d", view: "3d",
    compare: [], cmpIndex: -1, season: null, tl: null, mapHits: [],
    reqDays: 10, sky: null
  };

  /* ---------------- Geometry ---------------- */
  function elevAz(lat, lon, pLat, pLon) {
    const p1 = d2r(lat), p2 = d2r(pLat), dl = d2r(pLon - lon);
    const sinE = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
    const el = r2d(Math.asin(clamp(sinE, -1, 1)));
    const az = (r2d(Math.atan2(Math.sin(dl) * Math.cos(p2),
      Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))) + 360) % 360;
    return { el, az };
  }
  function elevOnly(lat, lon, pLat, pLon) {
    const p1 = d2r(lat), p2 = d2r(pLat);
    const sinE = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(d2r(pLon - lon));
    return r2d(Math.asin(clamp(sinE, -1, 1)));
  }
  // Topocentric correction: the observer stands on the surface, 1737 km from the Moon's centre.
  function topoEarthElev(geoElDeg, distKm) {
    const e = d2r(geoElDeg);
    return r2d(Math.atan2(Math.sin(e) - MOON_R_KM / (distKm || 384400), Math.cos(e)));
  }
  function sunPos(lat, lon, eph) { return elevAz(lat, lon, eph.subsolar_lat, eph.subsolar_lon); }
  function earthPos(lat, lon, eph) {
    const g = elevAz(lat, lon, eph.subearth_lat, eph.subearth_lon);
    return { el: topoEarthElev(g.el, eph.distance), az: g.az };
  }

  /* ---------------- Shared hourly ephemeris series [-16 d, +65 d] ---------------- */
  function getSeries(simMs) {
    if (state.ser && state.ser.simMs === simMs) return state.ser;
    const n = BACK_H + FWD_H + 1;
    const sLat = new Float64Array(n), sLon = new Float64Array(n);
    const eLat = new Float64Array(n), eLon = new Float64Array(n), dist = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const e = S.getEphemerisAt(new Date(simMs + (i - BACK_H) * HOUR));
      sLat[i] = e.subsolar_lat; sLon[i] = e.subsolar_lon;
      eLat[i] = e.subearth_lat; eLon[i] = e.subearth_lon; dist[i] = e.distance;
    }
    state.ser = { simMs, n, i0: BACK_H, sLat, sLon, eLat, eLon, dist };
    return state.ser;
  }
  const tOf = (ser, i) => ser.simMs + (i - ser.i0) * HOUR;

  function siteProfile(lat, lon, ser) {
    const sun = new Float32Array(ser.n), earth = new Float32Array(ser.n);
    for (let i = 0; i < ser.n; i++) {
      sun[i] = elevOnly(lat, lon, ser.sLat[i], ser.sLon[i]);
      earth[i] = topoEarthElev(elevOnly(lat, lon, ser.eLat[i], ser.eLon[i]), ser.dist[i]);
    }
    return { lat, lon, sun, earth };
  }

  // Same rules as app.js computeLandingWindows (daylight = Sun > 0.5 deg; touchdown = RISING Sun in band)
  function windowsFromProfile(prof, ser) {
    const isPolar = Math.abs(prof.lat) >= 80;
    const minOpt = isPolar ? 1.5 : 5, maxOpt = isPolar ? 16 : 28;
    const raw = []; let cur = null;
    for (let i = 0; i < ser.n; i++) {
      const el = prof.sun[i], prev = i > 0 ? prof.sun[i - 1] : el;
      const rising = el >= prev - 0.005, lit = el > LIT_MIN;
      if (lit && !cur) cur = { s: i, e: i, max: el, td0: -1, td1: -1 };
      else if (lit && cur) { cur.e = i; if (el > cur.max) cur.max = el; }
      else if (!lit && cur) { raw.push(cur); cur = null; }
      if (cur && rising && el >= minOpt && el <= maxOpt) { if (cur.td0 < 0) cur.td0 = i; cur.td1 = i; }
    }
    if (cur) raw.push(cur);
    return raw.filter((w) => w.e > ser.i0).map((w) => ({
      start: tOf(ser, w.s), end: tOf(ser, w.e),
      inProgress: w.s <= ser.i0 && w.e > ser.i0,
      openEnd: w.e === ser.n - 1,
      fullStayDays: (w.e - w.s) / 24,
      remainingDays: Math.max(0, (w.e - ser.i0) / 24),
      hasTd: w.td0 >= 0,
      tdStart: w.td0 >= 0 ? tOf(ser, w.td0) : tOf(ser, w.s),
      tdEnd: w.td1 >= 0 ? tOf(ser, w.td1) : tOf(ser, w.s) + 36 * HOUR,
      maxElev: w.max
    }));
  }

  // Precise crossing time by bisection on the real ephemeris (≈ 4 s precision)
  function valueAt(lat, lon, t, kind) {
    const e = S.getEphemerisAt(new Date(t));
    return kind === "sun"
      ? elevOnly(lat, lon, e.subsolar_lat, e.subsolar_lon)
      : topoEarthElev(elevOnly(lat, lon, e.subearth_lat, e.subearth_lon), e.distance);
  }
  function refineCrossing(lat, lon, tA, tB, kind, thr) {
    let a = tA, b = tB;
    const aAbove = valueAt(lat, lon, a, kind) > thr;
    for (let k = 0; k < 10; k++) {
      const m = (a + b) / 2;
      if ((valueAt(lat, lon, m, kind) > thr) === aAbove) a = m; else b = m;
    }
    return (a + b) / 2;
  }
  // First crossing of `thr` after the selected epoch. dir: "any" | "up" | "down"
  function nextCrossing(prof, ser, kind, thr, dir = "any") {
    const arr = kind === "sun" ? prof.sun : prof.earth;
    const i0 = ser.i0, aboveNow = arr[i0] > thr;
    for (let i = i0 + 1; i < ser.n; i++) {
      const was = arr[i - 1] > thr, is = arr[i] > thr;
      if (was === is) continue;
      if (dir === "up" && !is) continue;
      if (dir === "down" && is) continue;
      return { t: refineCrossing(prof.lat, prof.lon, tOf(ser, i - 1), tOf(ser, i), kind, thr), aboveNow };
    }
    return { t: null, aboveNow };
  }

  function fmtDur(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return "--";
    const h = Math.max(0, ms) / HOUR;
    if (h >= 24) {
      let d = Math.floor(h / 24), hh = Math.round(h - d * 24);
      if (hh === 24) { d += 1; hh = 0; }
      return `${d} d ${hh} h`;
    }
    let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    return `${hh} h ${mm} m`;
  }
  function fracAbove(arr, i0, len, thr) {
    let c = 0;
    for (let i = i0; i < i0 + len; i++) if (arr[i] > thr) c++;
    return c / len;
  }

  /* ---------------- Sky view ---------------- */
  function updateSky(ctx, ser, prof) {
    const { site, eph, simDate } = ctx;
    const simMs = simDate.getTime();
    const sunNow = sunPos(site.lat, site.lon, eph);
    const earthNow = earthPos(site.lat, site.lon, eph);
    const rising = ctx.sunRateDegPerHr >= -0.01;

    $("sky-sun-pos").textContent = `${sunNow.az.toFixed(0)}° ${COMPASS[cIdx(sunNow.az)]} / ${fmtSigned(sunNow.el)}°`;
    $("sky-sun-note").textContent = sunNow.el > LIT_MIN
      ? `${rising ? "Rising" : "Setting"} ${Math.abs(ctx.sunRateDegPerHr).toFixed(2)}°/h`
      : sunNow.el > -2 ? "At the horizon (twilight)" : "Below horizon (night)";

    const sunC = nextCrossing(prof, ser, "sun", LIT_MIN);
    let sunsetMs = null, sunriseMs = null;
    if (sunC.aboveNow) {
      sunsetMs = sunC.t;
      $("sky-sunset").textContent = sunC.t ? fmtDur(sunC.t - simMs) : "> 65 d";
      $("sky-sunset-at").textContent = sunC.t ? `Sunset ${fmtDate(sunC.t)}` : "No sunset in the 65-day scan";
    } else {
      sunriseMs = sunC.t;
      $("sky-sunset").textContent = "Night now";
      $("sky-sunset-at").textContent = sunC.t ? `Sunrise in ${fmtDur(sunC.t - simMs)} (${fmtDate(sunC.t)})` : "No sunrise in the 65-day scan";
    }

    const earthLit = clamp(100 - eph.phase, 0, 100);
    $("sky-earth-pos").textContent = `${earthNow.az.toFixed(0)}° ${COMPASS[cIdx(earthNow.az)]} / ${fmtSigned(earthNow.el)}°`;
    $("sky-earth-note").textContent = `Earth ${earthLit.toFixed(0)}% lit · ` +
      (earthNow.el > DTE_MIN ? "DTE link OK" : earthNow.el > 0 ? "too low for DTE (<2°)" : "below horizon");

    const e0 = nextCrossing(prof, ser, "earth", 0);
    const eD = nextCrossing(prof, ser, "earth", DTE_MIN);
    let earthsetMs = null, earthriseMs = null, dteLossMs = null;
    if (e0.aboveNow) {
      earthsetMs = e0.t;
      if (eD.aboveNow) dteLossMs = eD.t;
      $("sky-earthset").textContent = e0.t ? fmtDur(e0.t - simMs) : "Never";
      $("sky-earthset-at").textContent = e0.t
        ? `Earthset ${fmtDate(e0.t)}${dteLossMs ? ` · DTE lost in ${fmtDur(dteLossMs - simMs)}` : ""}`
        : `Earth stays above the horizon all 65 days${eD.aboveNow && eD.t ? ` (dips below 2° in ${fmtDur(eD.t - simMs)})` : ""}`;
    } else {
      earthriseMs = e0.t;
      $("sky-earthset").textContent = "Below horizon";
      $("sky-earthset-at").textContent = e0.t ? `Earthrise in ${fmtDur(e0.t - simMs)} (${fmtDate(e0.t)})` : "Never visible in 65 days — relay satellite required";
    }

    state.sky = { sunNow, earthNow, sunsetMs, sunriseMs, earthsetMs, earthriseMs, dteLossMs, earthLit };

    const cv = $("sky-canvas");
    if (state.skyMode === "dome") drawSkyDome(cv, ctx, ser, prof, sunNow, earthNow, earthLit);
    else drawSkyPano(cv, ctx, ser, prof, sunNow, earthNow, earthLit);
    cv.setAttribute("aria-label",
      `Sky at ${site.name}: Sun at azimuth ${sunNow.az.toFixed(0)} degrees, elevation ${sunNow.el.toFixed(1)} degrees; ` +
      `Earth at azimuth ${earthNow.az.toFixed(0)} degrees, elevation ${earthNow.el.toFixed(1)} degrees.`);
  }

  function trackPoints(ser, prof, kind, hours) {
    const pts = [];
    const end = Math.min(ser.n - 1, ser.i0 + hours);
    for (let i = ser.i0; i <= end; i++) {
      const az = kind === "sun"
        ? elevAz(prof.lat, prof.lon, ser.sLat[i], ser.sLon[i]).az
        : elevAz(prof.lat, prof.lon, ser.eLat[i], ser.eLon[i]).az;
      pts.push({ h: i - ser.i0, az, el: kind === "sun" ? prof.sun[i] : prof.earth[i] });
    }
    return pts;
  }

  function drawBody(g, x, y, kind, faded, earthLit) {
    g.save();
    g.globalAlpha = faded ? 0.35 : 1;
    if (kind === "sun") {
      const grd = g.createRadialGradient(x, y, 2, x, y, 26);
      grd.addColorStop(0, "rgba(255,244,190,1)"); grd.addColorStop(0.35, "rgba(253,224,71,0.9)"); grd.addColorStop(1, "rgba(253,224,71,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff7cc"; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = "#0b1d3a"; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
      // simple phase cue: lit fraction shown as a filled chord
      const grd = g.createLinearGradient(x - 13, y, x + 13, y);
      const k = clamp(earthLit / 100, 0, 1);
      grd.addColorStop(0, "#60a5fa"); grd.addColorStop(Math.max(0.01, k), "#2563eb"); grd.addColorStop(Math.min(1, k + 0.02), "#0b1d3a");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#93c5fd"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  function drawTrack(g, pts, toXY, color, dayLabelEvery) {
    g.save();
    g.strokeStyle = color; g.lineWidth = 2; g.setLineDash([6, 5]);
    g.beginPath();
    let prev = null;
    for (const p of pts) {
      const q = toXY(p);
      if (!q) { prev = null; continue; }
      if (!prev || Math.abs(q.x - prev.x) > 200) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
      prev = q;
    }
    g.stroke(); g.setLineDash([]);
    g.fillStyle = color; g.font = "600 15px Inter, sans-serif";
    for (const p of pts) {
      if (p.h === 0 || p.h % 24 !== 0) continue;
      const q = toXY(p); if (!q) continue;
      g.beginPath(); g.arc(q.x, q.y, 3, 0, Math.PI * 2); g.fill();
      if ((p.h / 24) % dayLabelEvery === 0) g.fillText(`+${p.h / 24}d`, q.x + 5, q.y - 6);
    }
    g.restore();
  }

  function drawSkyPano(cv, ctx, ser, prof, sunNow, earthNow, earthLit) {
    const g = cv.getContext("2d"), W = cv.width, H = cv.height;
    const padL = 56, padR = 18, padT = 18, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const EL_MIN = -15, EL_MAX = 90;
    const centerAz = ctx.site.lat >= ctx.eph.subsolar_lat ? 180 : 0; // face the equator, where the Sun crosses
    const xOf = (az) => padL + (((az - centerAz + 540) % 360) / 360) * plotW;
    const yOf = (el) => padT + ((EL_MAX - clamp(el, EL_MIN, EL_MAX)) / (EL_MAX - EL_MIN)) * plotH;
    const y0 = yOf(0);
    g.clearRect(0, 0, W, H);

    const sky = g.createLinearGradient(0, padT, 0, y0);
    sky.addColorStop(0, "#000000"); sky.addColorStop(1, "#070d22");
    g.fillStyle = sky; g.fillRect(padL, padT, plotW, y0 - padT);

    g.strokeStyle = "rgba(255,255,255,0.10)"; g.setLineDash([3, 5]); g.lineWidth = 1;
    g.fillStyle = "#8b9bb8"; g.font = "600 14px Inter, sans-serif";
    [30, 60, 90].forEach((el) => {
      const y = yOf(el); g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + plotW, y); g.stroke();
      g.fillText(`${el}°`, 10, y + 5);
    });
    g.setLineDash([]);
    g.fillText("0°", 18, y0 + 5);

    // Tracks (clipped above the horizon)
    g.save(); g.beginPath(); g.rect(padL, padT, plotW, y0 - padT); g.clip();
    const toXY = (p) => ({ x: xOf(p.az), y: yOf(p.el) });
    drawTrack(g, trackPoints(ser, prof, "sun", 15 * 24), toXY, "rgba(253,224,71,0.85)", 5);
    drawTrack(g, trackPoints(ser, prof, "earth", 30 * 24), toXY, "rgba(56,189,248,0.85)", 10);
    g.restore();

    // Ground
    const gr = g.createLinearGradient(0, y0, 0, padT + plotH);
    gr.addColorStop(0, "#6b6b70"); gr.addColorStop(1, "#26262b");
    g.fillStyle = gr; g.fillRect(padL, y0, plotW, padT + plotH - y0);
    g.strokeStyle = "#cbd5e1"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(padL, y0); g.lineTo(padL + plotW, y0); g.stroke();

    // Compass labels
    g.fillStyle = "#e2e8f0"; g.font = "700 15px Inter, sans-serif"; g.textAlign = "center";
    for (let k = 0; k < 8; k++) {
      const az = k * 45, x = xOf(az);
      g.fillText(COMPASS[k], x, padT + plotH + 24);
      g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 6); g.stroke();
    }
    g.fillText(COMPASS[0], padL + plotW - 2, padT + plotH + 24);
    g.textAlign = "left";

    // Bodies
    const bodies = [
      { kind: "earth", p: earthNow, label: `⊕ Earth ${fmtSigned(earthNow.el)}°` },
      { kind: "sun", p: sunNow, label: `☀ Sun ${fmtSigned(sunNow.el)}°` }
    ];
    bodies.forEach((b) => {
      const x = xOf(b.p.az);
      if (b.p.el >= EL_MIN) {
        const y = yOf(b.p.el);
        drawBody(g, x, y, b.kind, b.p.el < 0, earthLit);
        g.fillStyle = b.kind === "sun" ? "#fde68a" : "#bae6fd"; g.font = "700 16px Inter, sans-serif";
        g.fillText(b.label + (b.p.el < 0 ? " (below horizon)" : ""), Math.min(x + 18, W - 260), Math.max(padT + 16, y - 16));
      } else {
        g.fillStyle = b.kind === "sun" ? "#fde68a" : "#bae6fd"; g.font = "700 15px Inter, sans-serif";
        g.fillText(`▼ ${b.label} (below horizon)`, Math.min(x - 30, W - 300), padT + plotH - 6);
      }
    });

    g.fillStyle = "#64748b"; g.font = "600 13px Inter, sans-serif";
    g.fillText(`Horizon panorama centred on ${centerAz === 180 ? "south" : "north"} · lunar sky is black even in daylight (no atmosphere)`, padL + 6, padT + 16);
  }

  function drawSkyDome(cv, ctx, ser, prof, sunNow, earthNow, earthLit) {
    const g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = H / 2 - 22;
    const pos = (az, el) => {
      const r = ((90 - el) / 90) * R;
      return { x: cx + r * Math.sin(d2r(az)), y: cy - r * Math.cos(d2r(az)) };
    };
    const sky = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    sky.addColorStop(0, "#000"); sky.addColorStop(1, "#0a1330");
    g.fillStyle = sky; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#cbd5e1"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.14)"; g.setLineDash([3, 5]); g.lineWidth = 1;
    [30, 60].forEach((el) => { g.beginPath(); g.arc(cx, cy, ((90 - el) / 90) * R, 0, Math.PI * 2); g.stroke(); });
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#e2e8f0"; g.font = "700 16px Inter, sans-serif"; g.textAlign = "center";
    g.fillText("N", cx, cy - R - 6); g.fillText("S", cx, cy + R + 18);
    g.fillText("E", cx + R + 14, cy + 5); g.fillText("W", cx - R - 14, cy + 5);
    g.font = "600 12px Inter, sans-serif"; g.fillStyle = "#64748b";
    g.fillText("30°", cx + 4, cy - ((60) / 90) * R + 14); g.fillText("60°", cx + 4, cy - (30 / 90) * R + 14);
    g.textAlign = "left";

    const toXY = (p) => (p.el >= 0 ? pos(p.az, p.el) : null);
    drawTrack(g, trackPoints(ser, prof, "sun", 15 * 24), toXY, "rgba(253,224,71,0.85)", 5);
    drawTrack(g, trackPoints(ser, prof, "earth", 30 * 24), toXY, "rgba(56,189,248,0.85)", 10);

    [{ kind: "earth", p: earthNow, label: "⊕ Earth" }, { kind: "sun", p: sunNow, label: "☀ Sun" }].forEach((b) => {
      const below = b.p.el < 0;
      const q = pos(b.p.az, below ? 0 : b.p.el);
      drawBody(g, q.x, q.y, b.kind, below, earthLit);
      g.fillStyle = b.kind === "sun" ? "#fde68a" : "#bae6fd"; g.font = "700 15px Inter, sans-serif";
      g.fillText(`${b.label} ${fmtSigned(b.p.el)}°${below ? " (below)" : ""}`, q.x + 16, q.y - 12);
    });

    g.fillStyle = "#8b9bb8"; g.font = "600 14px Inter, sans-serif";
    ["Sky dome, seen from above", "Centre = straight overhead", "Rim = horizon", "N up · E right"].forEach((t, i) => g.fillText(t, 18, 30 + i * 22));
    g.fillStyle = "#fde68a"; g.fillText("- - Sun path (15 d)", W - 200, 30);
    g.fillStyle = "#7dd3fc"; g.fillText("- - Earth path (30 d)", W - 200, 52);
  }

  /* ---------------- Power & communications ---------------- */
  function solarFlux(ms) {
    const jd = ms / DAY + 2440587.5;
    const M = d2r(357.5291 + 0.98560028 * (jd - 2451545));
    const r = 1.00014 - 0.01671 * Math.cos(M) - 0.00014 * Math.cos(2 * M);
    return 1361 / (r * r);
  }

  function updatePower(ctx, ser, prof) {
    const simMs = ctx.simDate.getTime();
    const sunEl = ctx.sunElev;
    const flux = solarFlux(simMs);
    const horiz = sunEl > 0 ? flux * Math.sin(d2r(sunEl)) : 0;
    const vert = sunEl > 0 ? flux * Math.cos(d2r(sunEl)) : 0;
    $("pw-flux").textContent = `${Math.round(flux)} W/m²`;
    $("pw-horiz").textContent = `${Math.round(horiz)} W/m²`;
    $("pw-horiz-pct").textContent = sunEl > 0 ? `${((horiz / flux) * 100).toFixed(0)}% of full sun` : "No sunlight";
    $("pw-vert").textContent = `${Math.round(vert)} W/m²`;
    $("pw-vert-pct").textContent = sunEl > 0 ? `${((vert / flux) * 100).toFixed(0)}% of full sun${vert > horiz ? " · best option here" : ""}` : "No sunlight";

    const wins = ctx.daylightWindows || [];
    const active = wins.find((w) => w.inProgress) || null;
    const nextFull = wins.find((w) => !w.inProgress) || null;
    const remDays = active ? active.remainingDaysFromNow : 0;
    $("pw-sun-left").textContent = active ? `${remDays.toFixed(1)} d` : "0 d (night)";
    $("pw-sun-cycle").textContent = active
      ? `of a ${active.fullStayDays.toFixed(1)}-day lunar day`
      : nextFull ? `next day: ${nextFull.fullStayDays.toFixed(1)} d from ${fmtDate(nextFull.start.getTime())}` : "no sunlight in scan";

    const N30 = 30 * 24, i0 = ser.i0;
    const fSun = fracAbove(prof.sun, i0, N30, LIT_MIN);
    const fEarth = fracAbove(prof.earth, i0, N30, DTE_MIN);
    let both = 0, run = 0, best = 0;
    for (let i = i0; i < i0 + N30; i++) {
      if (prof.sun[i] > LIT_MIN && prof.earth[i] > DTE_MIN) { both++; run++; best = Math.max(best, run); } else run = 0;
    }
    const fBoth = both / N30;
    const setBar = (id, f, label) => { $(id).style.width = `${(f * 100).toFixed(1)}%`; $(id + "-val").textContent = label; };
    setBar("bar-sun", fSun, `${(fSun * 100).toFixed(0)}% · ${(fSun * 30).toFixed(1)} d`);
    setBar("bar-earth", fEarth, `${(fEarth * 100).toFixed(0)}% · ${(fEarth * 30).toFixed(1)} d`);
    setBar("bar-both", fBoth, `${(fBoth * 100).toFixed(0)}% · longest ${(best / 24).toFixed(1)} d`);

    const req = state.reqDays;
    const sky = state.sky || {};
    const dteNow = ctx.earthElev > DTE_MIN;
    const earthStays = dteNow && (!sky.dteLossMs || sky.dteLossMs - simMs >= req * DAY);
    const slopeOK = ctx.slope === null || ctx.slope <= 10;
    const checks = [
      { ok: sunEl > LIT_MIN, txt: sunEl > LIT_MIN ? `Sun is up (${fmtSigned(sunEl)}°) — solar arrays can charge` : `Sun is down (${fmtSigned(sunEl)}°) — no solar power` },
      { ok: sunEl > LIT_MIN && ctx.sunRateDegPerHr >= -0.01, txt: ctx.sunRateDegPerHr >= -0.01 ? "Local morning — the whole remaining day is ahead" : "Local afternoon — Sun is already sinking" },
      { ok: remDays >= req, txt: `Sunlight left ${remDays.toFixed(1)} d vs. ${req} d needed` },
      { ok: dteNow, txt: dteNow ? `Earth ${ctx.earthElev.toFixed(1)}° high — direct radio link to Earth` : `Earth ${ctx.earthElev.toFixed(1)}° — relay satellite needed` },
      { ok: earthStays, txt: earthStays ? `Earth stays ≥2° for the full ${req} d` : dteNow ? `Earth drops below 2° in ${fmtDur(sky.dteLossMs - simMs)} — before the ${req}-day mission ends` : "No direct-to-Earth link during the mission" },
      { ok: slopeOK, txt: ctx.slope === null ? "Regional slope: loading LOLA…" : `Regional LOLA slope ${ctx.slope.toFixed(1)}° (${slopeOK ? "≤" : ">"} 10° planning limit)` }
    ];
    $("viability-checks").innerHTML = checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}"><span>${c.ok ? "✓" : "✗"}</span>${c.txt}</li>`).join("");

    const powerOK = checks[0].ok && checks[2].ok;
    const commsOK = checks[3].ok && checks[4].ok;
    const pill = $("viability-pill");
    pill.className = "stay-pill";
    if (!powerOK) { pill.classList.add("nogo"); pill.textContent = "NOT VIABLE AT THIS EPOCH"; }
    else if (!commsOK || !slopeOK || !checks[1].ok) { pill.classList.add("caution"); pill.textContent = commsOK ? "MARGINAL" : "MARGINAL · RELAY NEEDED"; }
    else { pill.classList.add("go"); pill.textContent = "VIABLE"; }
  }

  /* ---------------- 30-day timeline & 12-lunation seasons ---------------- */
  function drawTimeline30(ctx, ser, prof) {
    const cv = $("solar-chart"), g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const padL = 64, padR = 14, padT = 14, ganttH = 54, padB = 40;
    const plotW = W - padL - padR, plotBottom = H - padB - ganttH - 8, plotH = plotBottom - padT;
    const hours = 30 * 24, i0 = ser.i0;
    const xOf = (h) => padL + (h / hours) * plotW;
    const yOf = (el) => padT + ((90 - clamp(el, -90, 90)) / 180) * plotH;
    const isPolar = Math.abs(prof.lat) >= 80, minOpt = isPolar ? 1.5 : 5, maxOpt = isPolar ? 16 : 28;

    g.fillStyle = "rgba(3,6,15,0.6)"; g.fillRect(padL, padT, plotW, plotH);
    const colW = plotW / hours + 0.6;
    for (let h = 0; h < hours; h++) {
      const s = prof.sun[i0 + h], sPrev = prof.sun[i0 + h - 1];
      const x = xOf(h);
      if (s <= LIT_MIN) { g.fillStyle = "rgba(15,23,42,0.75)"; g.fillRect(x, padT, colW, plotH); }
      else if (s >= sPrev - 0.005 && s >= minOpt && s <= maxOpt) { g.fillStyle = "rgba(16,185,129,0.22)"; g.fillRect(x, padT, colW, plotH); }
    }
    g.fillStyle = "rgba(16,185,129,0.16)"; g.fillRect(padL, yOf(maxOpt), plotW, yOf(minOpt) - yOf(maxOpt));
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(padL, yOf(0)); g.lineTo(padL + plotW, yOf(0)); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#8b9bb8"; g.font = "600 13px Inter, sans-serif";
    [90, 45, 0, -45, -90].forEach((el) => g.fillText(`${el > 0 ? "+" : ""}${el}°`, 14, yOf(el) + 5));

    const line = (arr, color) => {
      g.strokeStyle = color; g.lineWidth = 2.4; g.beginPath();
      for (let h = 0; h <= hours; h++) { const x = xOf(h), y = yOf(arr[i0 + h]); if (h === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    };
    line(prof.earth, "#38bdf8");
    line(prof.sun, "#fbbf24");

    // Gantt rows
    const rows = [
      { label: "SUN", color: "#fbbf24", test: (h) => prof.sun[i0 + h] > LIT_MIN },
      { label: "EARTH", color: "#38bdf8", test: (h) => prof.earth[i0 + h] > DTE_MIN },
      { label: "BOTH", color: "#10b981", test: (h) => prof.sun[i0 + h] > LIT_MIN && prof.earth[i0 + h] > DTE_MIN }
    ];
    rows.forEach((r, k) => {
      const y = plotBottom + 8 + k * 18;
      g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(padL, y, plotW, 13);
      g.fillStyle = r.color;
      for (let h = 0; h < hours; h++) if (r.test(h)) g.fillRect(xOf(h), y, colW, 13);
      g.fillStyle = "#8b9bb8"; g.font = "700 11px Inter, sans-serif"; g.fillText(r.label, 10, y + 11);
    });

    g.fillStyle = "#8b9bb8"; g.font = "600 13px Inter, sans-serif"; g.textAlign = "center";
    for (let d = 0; d <= 30; d += 5) {
      const x = xOf(d * 24), t = new Date(ser.simMs + d * DAY);
      g.fillText(`+${d}d · ${t.toISOString().slice(5, 10)}`, Math.min(Math.max(x, padL + 40), W - 60), H - 12);
    }
    g.textAlign = "left";
    g.strokeStyle = "#fc3d21"; g.lineWidth = 2; g.beginPath(); g.moveTo(padL + 1, padT); g.lineTo(padL + 1, plotBottom); g.stroke();

    state.tl = { mode: "30d", padL, plotW, hours, startMs: ser.simMs, top: padT, bottom: H - padB };
    cv.setAttribute("aria-label", `30-day timeline for ${ctx.site.name}: sunlit ${(fracAbove(prof.sun, i0, hours, LIT_MIN) * 100).toFixed(0)} percent, Earth in view ${(fracAbove(prof.earth, i0, hours, DTE_MIN) * 100).toFixed(0)} percent of the time.`);
  }

  function getSeasonSeries(simMs) {
    const dayKey = Math.floor(simMs / DAY);
    if (state.season && state.season.dayKey === dayKey) return state.season;
    const start = dayKey * DAY, step = 3 * HOUR, nBuckets = 12;
    const bucketMs = S.SYNODIC_DAYS * DAY;
    const total = Math.round((nBuckets * bucketMs) / step);
    const sLat = new Float64Array(total), sLon = new Float64Array(total);
    const eLat = new Float64Array(total), eLon = new Float64Array(total), dist = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      const e = S.getEphemerisAt(new Date(start + i * step));
      sLat[i] = e.subsolar_lat; sLon[i] = e.subsolar_lon; eLat[i] = e.subearth_lat; eLon[i] = e.subearth_lon; dist[i] = e.distance;
    }
    state.season = { dayKey, start, step, total, nBuckets, bucketMs, sLat, sLon, eLat, eLon, dist };
    return state.season;
  }

  function drawSeasons(ctx) {
    const se = getSeasonSeries(ctx.simDate.getTime());
    const { lat, lon } = ctx.site;
    const cv = $("solar-chart"), g = cv.getContext("2d"), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const padL = 56, padR = 56, padT = 18, padB = 46;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const buckets = [];
    for (let b = 0; b < se.nBuckets; b++) {
      const i1 = Math.floor((b * se.bucketMs) / se.step), i2 = Math.floor(((b + 1) * se.bucketMs) / se.step);
      let lit = 0, dte = 0, both = 0, latSum = 0;
      for (let i = i1; i < i2; i++) {
        const s = elevOnly(lat, lon, se.sLat[i], se.sLon[i]) > LIT_MIN;
        const e = topoEarthElev(elevOnly(lat, lon, se.eLat[i], se.eLon[i]), se.dist[i]) > DTE_MIN;
        if (s) lit++; if (e) dte++; if (s && e) both++; latSum += se.sLat[i];
      }
      const n = i2 - i1;
      buckets.push({ lit: lit / n, dte: dte / n, both: both / n, sLat: latSum / n, start: se.start + b * se.bucketMs });
    }
    const yOf = (f) => padT + (1 - f) * plotH;
    g.strokeStyle = "rgba(255,255,255,0.1)"; g.fillStyle = "#8b9bb8"; g.font = "600 13px Inter, sans-serif";
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => { g.beginPath(); g.moveTo(padL, yOf(f)); g.lineTo(padL + plotW, yOf(f)); g.stroke(); g.fillText(`${f * 100}%`, 8, yOf(f) + 5); });
    const gw = plotW / se.nBuckets, bw = (gw - 14) / 3;
    buckets.forEach((b, k) => {
      const x = padL + k * gw + 7;
      [["lit", "#fbbf24"], ["dte", "#38bdf8"], ["both", "#10b981"]].forEach(([key, col], j) => {
        g.fillStyle = col; g.fillRect(x + j * bw, yOf(b[key]), bw - 2, yOf(0) - yOf(b[key]));
      });
      g.fillStyle = "#8b9bb8"; g.textAlign = "center";
      g.fillText(new Date(b.start).toISOString().slice(2, 10), x + gw / 2 - 7, H - 24);
      g.textAlign = "left";
    });
    // Sub-solar latitude ("lunar season") on the right axis, ±1.6°
    const yLat = (v) => padT + ((1.6 - clamp(v, -1.6, 1.6)) / 3.2) * plotH;
    g.strokeStyle = "#c084fc"; g.lineWidth = 2; g.beginPath();
    buckets.forEach((b, k) => { const x = padL + k * gw + gw / 2; if (k === 0) g.moveTo(x, yLat(b.sLat)); else g.lineTo(x, yLat(b.sLat)); });
    g.stroke();
    g.fillStyle = "#c084fc"; g.font = "600 12px Inter, sans-serif";
    ["+1.6°", "0°", "−1.6°"].forEach((t, i) => g.fillText(t, W - padR + 8, padT + (i * plotH) / 2 + 5));
    g.fillText("Sub-solar latitude (season)", W - 260, padT + 14);
    g.fillStyle = "#8b9bb8"; g.fillText("Each group = one lunation (29.5 d): ■ sunlit  ■ Earth ≥2°  ■ both — click a group to jump there", padL, H - 6);

    state.tl = { mode: "12m", padL, plotW, nBuckets: se.nBuckets, start: se.start, bucketMs: se.bucketMs, buckets, top: padT, bottom: H - padB };
    cv.setAttribute("aria-label", `12-lunation seasonal view for ${ctx.site.name}: sunlit fraction ranges ${(Math.min(...buckets.map((b) => b.lit)) * 100).toFixed(0)} to ${(Math.max(...buckets.map((b) => b.lit)) * 100).toFixed(0)} percent.`);
  }

  function chartEventInfo(ev) {
    const cv = $("solar-chart"), r = cv.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (cv.width / r.width);
    const tl = state.tl; if (!tl) return null;
    const f = (x - tl.padL) / tl.plotW;
    if (f < 0 || f > 1) return null;
    return { f, cssX: ev.clientX - r.left, cssY: ev.clientY - r.top };
  }

  /* ---------------- 2D map ---------------- */
  const mapImg = new Image();
  let mapImgReady = false;
  mapImg.onload = () => { mapImgReady = true; if (state.view === "2d") drawMap(); };
  mapImg.src = "assets/lroc_color_2k.jpg";
  const shadeCv = document.createElement("canvas");
  shadeCv.width = 360; shadeCv.height = 180;

  function circlePoints(lat, lon, angDeg, steps = 240) {
    const p = d2r(lat), l = d2r(lon);
    const n = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
    const ref = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let u = [ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]];
    const ul = Math.hypot(...u); u = u.map((c) => c / ul);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const a = d2r(angDeg), ca = Math.cos(a), sa = Math.sin(a), pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const q = [0, 1, 2].map((i) => ca * n[i] + sa * (ct * u[i] + st * v[i]));
      pts.push({ lat: r2d(Math.asin(clamp(q[2], -1, 1))), lon: r2d(Math.atan2(q[1], q[0])) });
    }
    return pts;
  }
  function strokeLatLonPath(g, pts, X, Y, W) {
    g.beginPath();
    let prev = null;
    for (const p of pts) {
      const x = X(p.lon), y = Y(p.lat);
      if (!prev || Math.abs(x - prev) > W / 2) g.moveTo(x, y); else g.lineTo(x, y);
      prev = x;
    }
    g.stroke();
  }

  function drawMap() {
    const ctx = state.ctx; if (!ctx) return;
    const cv = $("map2d"), g = cv.getContext("2d"), W = cv.width, H = cv.height;
    const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H;
    const eph = ctx.eph;
    g.fillStyle = "#03050d"; g.fillRect(0, 0, W, H);
    if (mapImgReady) g.drawImage(mapImg, 0, 0, W, H);

    // Day / night shading from the live sub-solar point
    const sg = shadeCv.getContext("2d"), img = sg.createImageData(360, 180), data = img.data;
    const sp = d2r(eph.subsolar_lat), ssp = Math.sin(sp), csp = Math.cos(sp);
    for (let y = 0; y < 180; y++) {
      const la = d2r(89.5 - y), sl = Math.sin(la), cl = Math.cos(la);
      for (let x = 0; x < 360; x++) {
        const el = r2d(Math.asin(clamp(sl * ssp + cl * csp * Math.cos(d2r(-179.5 + x - eph.subsolar_lon)), -1, 1)));
        const a = el < -1.5 ? 0.68 : el > 1.5 ? 0 : (0.68 * (1.5 - el)) / 3;
        const k = (y * 360 + x) * 4;
        data[k] = 2; data[k + 1] = 5; data[k + 2] = 18; data[k + 3] = Math.round(a * 255);
      }
    }
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(shadeCv, 0, 0, W, H);

    // Graticule
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1;
    g.fillStyle = "rgba(226,232,240,0.7)"; g.font = "600 14px Inter, sans-serif";
    for (let lo = -150; lo <= 150; lo += 30) { g.beginPath(); g.moveTo(X(lo), 0); g.lineTo(X(lo), H); g.stroke(); g.fillText(`${Math.abs(lo)}°${lo < 0 ? "W" : lo > 0 ? "E" : ""}`, X(lo) + 4, H - 8); }
    for (let la = -60; la <= 60; la += 30) { g.beginPath(); g.moveTo(0, Y(la)); g.lineTo(W, Y(la)); g.stroke(); g.fillText(`${Math.abs(la)}°${la < 0 ? "S" : la > 0 ? "N" : ""}`, 6, Y(la) - 4); }
    g.fillStyle = "rgba(226,232,240,0.55)";
    g.fillText("NEAR SIDE (faces Earth)", X(0) - 90, 22); g.fillText("FAR SIDE", X(-180) + 10, 22); g.fillText("FAR SIDE", X(180) - 82, 22);

    // Terminator & Earth horizon
    g.lineWidth = 2.5;
    g.strokeStyle = "#fde047"; g.setLineDash([12, 7]);
    strokeLatLonPath(g, circlePoints(eph.subsolar_lat, eph.subsolar_lon, 90), X, Y, W);
    g.strokeStyle = "#38bdf8"; g.setLineDash([4, 6]);
    strokeLatLonPath(g, circlePoints(eph.subearth_lat, eph.subearth_lon, 90), X, Y, W);
    g.setLineDash([]);

    const reg = S.getActiveRegion && S.getActiveRegion();
    if (reg) { g.strokeStyle = "#38bdf8"; g.lineWidth = 3; strokeLatLonPath(g, circlePoints(reg.lat, reg.lon, reg.radiusDeg, 120), X, Y, W); }

    // Missions
    state.mapHits = [];
    const filter = S.getMissionFilter ? S.getMissionFilter() : "all";
    S.MISSIONS.filter((m) => S.missionMatchesFilter(m, filter)).forEach((m) => {
      const x = X(m.lon), y = Y(m.lat);
      g.fillStyle = m.isCurrent ? "#10b981" : m.category === "planned" ? "#f59e0b" : "#38bdf8";
      g.beginPath(); g.arc(x, y, m.isCurrent ? 7 : 5.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = 1.5; g.stroke();
      state.mapHits.push({ x, y, mission: m });
    });

    // Compared sites
    state.compare.forEach((c, k) => {
      const x = X(c.lon), y = Y(c.lat);
      g.fillStyle = "#c084fc"; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1e0b3a"; g.font = "800 14px Inter, sans-serif"; g.textAlign = "center"; g.fillText(String(k + 1), x, y + 5); g.textAlign = "left";
    });

    // Sub-solar & sub-Earth points
    const glyph = (lat, lon, txt, col) => {
      const x = X(lon), y = Y(lat);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.font = "800 22px Inter, sans-serif"; g.textAlign = "center"; g.fillText(txt, x, y + 8); g.textAlign = "left";
    };
    glyph(eph.subsolar_lat, eph.subsolar_lon, "☀", "#fde047");
    glyph(eph.subearth_lat, eph.subearth_lon, "⊕", "#7dd3fc");

    // Selected target
    const tx = X(ctx.site.lon), ty = Y(ctx.site.lat);
    g.strokeStyle = "#fc3d21"; g.lineWidth = 3; g.beginPath(); g.arc(tx, ty, 14, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#fc3d21"; g.beginPath(); g.arc(tx, ty, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = "700 15px Inter, sans-serif";
    g.fillText(ctx.site.name.length > 40 ? ctx.site.name.slice(0, 38) + "…" : ctx.site.name, Math.min(tx + 18, W - 360), Math.max(ty - 16, 40));
  }

  function mapCoords(ev) {
    const cv = $("map2d"), r = cv.getBoundingClientRect();
    const scale = Math.min(r.width / cv.width, r.height / cv.height);
    const ox = (r.width - cv.width * scale) / 2, oy = (r.height - cv.height * scale) / 2;
    const px = (ev.clientX - r.left - ox) / scale, py = (ev.clientY - r.top - oy) / scale;
    if (px < 0 || py < 0 || px > cv.width || py > cv.height) return null;
    return { px, py, lat: 90 - (py / cv.height) * 180, lon: (px / cv.width) * 360 - 180, cssX: ev.clientX - r.left, cssY: ev.clientY - r.top, scale };
  }
  function mapHit(c) {
    let best = null, bd = 14 / Math.max(c.scale, 0.2);
    state.mapHits.forEach((h) => { const d = Math.hypot(h.x - c.px, h.y - c.py); if (d < bd) { bd = d; best = h; } });
    return best;
  }

  /* ---------------- Comparison ---------------- */
  const LS_COMPARE = "selene.compare.v1";
  try { state.compare = JSON.parse(localStorage.getItem(LS_COMPARE) || "[]").slice(0, 4); } catch (e) { state.compare = []; }
  const saveCompare = () => { try { localStorage.setItem(LS_COMPARE, JSON.stringify(state.compare)); } catch (e) { /* ignore */ } };
  const sameSite = (a, b) => Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005;

  function addCompare(site) {
    if (state.compare.some((c) => sameSite(c, site))) { toast("This site is already in the comparison."); return; }
    if (state.compare.length >= 4) { toast("Comparison is full (4 sites). Remove one first."); return; }
    state.compare.push({ id: site.id, name: site.name, lat: site.lat, lon: site.lon });
    saveCompare();
    S.refresh();
  }

  function siteMetrics(site, ser) {
    const prof = siteProfile(site.lat, site.lon, ser), i0 = ser.i0;
    const sunNow = prof.sun[i0], rate = prof.sun[i0 + 1] - prof.sun[i0], earthNow = prof.earth[i0];
    const wins = windowsFromProfile(prof, ser);
    const active = wins.find((w) => w.inProgress) || null;
    const upcoming = wins.filter((w) => !w.inProgress);
    const isPolar = Math.abs(site.lat) >= 80, minOpt = isPolar ? 1.5 : 5, maxOpt = isPolar ? 16 : 28;
    const rising = rate >= -0.01;
    let nextTd = null;
    if (active && rising && sunNow >= minOpt && sunNow <= maxOpt) nextTd = ser.simMs;
    else { const w = wins.find((x) => x.hasTd && x.tdStart > ser.simMs); nextTd = w ? w.tdStart : null; }
    const full = (upcoming[0] || active || {}).fullStayDays;
    const N30 = 30 * 24;
    let both = 0;
    for (let i = i0; i < i0 + N30; i++) if (prof.sun[i] > LIT_MIN && prof.earth[i] > DTE_MIN) both++;
    const dem = S.demAt(site.lat, site.lon);
    const slope = dem ? dem.slope : null;
    let verdict, vcls;
    if (sunNow < LIT_MIN) { verdict = "NO-GO (night)"; vcls = "nogo"; }
    else if (slope !== null && slope > 10) { verdict = "CAUTION (slope)"; vcls = "caution"; }
    else if (!rising) { verdict = "CAUTION (afternoon)"; vcls = "caution"; }
    else if (sunNow < minOpt) { verdict = "CAUTION (low sun)"; vcls = "caution"; }
    else if (sunNow > maxOpt) { verdict = "CAUTION (high sun)"; vcls = "caution"; }
    else { verdict = earthNow > DTE_MIN ? "GO" : "GO (relay)"; vcls = "go"; }
    const tod = sunNow <= LIT_MIN ? "Night" : rate > 0.03 ? "Morning" : rate < -0.03 ? "Afternoon" : "Noon";
    return {
      sunNow, tod, remaining: active ? active.remainingDays : 0, nextTd, full: full === undefined ? null : full,
      earthNow, dte30: fracAbove(prof.earth, i0, N30, DTE_MIN), both30: both / N30,
      slope, tempK: S.estimateSurfaceTempK(sunNow, site.lat), verdict, vcls
    };
  }

  function renderCompare(ser) {
    const table = $("compare-table"), empty = $("compare-empty");
    $("compare-count").textContent = `${state.compare.length} / 4 sites in comparison`;
    if (!state.compare.length) { table.hidden = true; empty.hidden = false; return; }
    table.hidden = false; empty.hidden = true;
    const sel = S.getSelectedSite();
    const ms = state.compare.map((c) => siteMetrics(c, ser));
    const rows = [
      ["Sun now", (m) => `${fmtSigned(m.sunNow)}° · ${m.tod}`, null],
      ["Sunlight left", (m) => `${m.remaining.toFixed(1)} d`, (m) => m.remaining, "max"],
      ["Next touchdown window", (m) => (m.nextTd === null ? "none in 65 d" : m.nextTd === ser.simMs ? "OPEN NOW" : fmtDate(m.nextTd).slice(0, 16)), (m) => (m.nextTd === null ? Infinity : m.nextTd), "min"],
      ["Full lunar day", (m) => (m.full === null ? "--" : `${m.full.toFixed(1)} d`), (m) => (m.full === null ? -1 : m.full), "max"],
      ["Earth now", (m) => `${fmtSigned(m.earthNow)}°${m.earthNow > DTE_MIN ? " · DTE" : " · relay"}`, (m) => m.earthNow, "max"],
      ["Earth ≥2° (30 d)", (m) => `${(m.dte30 * 100).toFixed(0)}%`, (m) => m.dte30, "max"],
      ["Power + DTE (30 d)", (m) => `${(m.both30 * 100).toFixed(0)}%`, (m) => m.both30, "max"],
      ["Regional slope", (m) => (m.slope === null ? "--" : `${m.slope.toFixed(1)}°`), (m) => (m.slope === null ? Infinity : m.slope), "min"],
      ["Est. surface temp", (m) => `${m.tempK} K (${m.tempK - 273 >= 0 ? "+" : ""}${m.tempK - 273} °C)`, null],
      ["Verdict at epoch", (m) => `<span class="v-${m.vcls}">${m.verdict}</span>`, null]
    ];
    let html = "<thead><tr><th>Metric</th>";
    state.compare.forEach((c, k) => {
      const isSel = sameSite(c, sel);
      html += `<th class="${isSel ? "sel" : ""}"><div class="cmp-h"><b>${k + 1}. ${escapeHtml(c.name)}</b><small>${S.formatCoord(c.lat, c.lon)}</small>
        <span><button type="button" class="mini-btn" data-cmp-focus="${k}">Focus</button><button type="button" class="mini-btn" data-cmp-remove="${k}" aria-label="Remove ${escapeHtml(c.name)}">✕</button></span></div></th>`;
    });
    html += "</tr></thead><tbody>";
    rows.forEach(([label, fmt, val, dir]) => {
      let bestK = -1;
      if (val && ms.length > 1) {
        const vals = ms.map(val);
        const target = dir === "max" ? Math.max(...vals) : Math.min(...vals);
        if (isFinite(target) && vals.filter((v) => v === target).length < vals.length) bestK = vals.indexOf(target);
      }
      html += `<tr><th scope="row">${label}</th>`;
      ms.forEach((m, k) => {
        const isSel = sameSite(state.compare[k], sel);
        html += `<td class="${k === bestK ? "best" : ""}${isSel ? " sel" : ""}">${fmt(m)}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;
  }

  function focusCompare(k) {
    const c = state.compare[k]; if (!c) return;
    state.cmpIndex = k;
    const m = S.MISSIONS.find((x) => x.id === c.id);
    if (m) S.selectMission(m, true); else S.selectCustomCoordinate(c.lat, c.lon, true);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  /* ---------------- Plain-language summary (Learn mode) ---------------- */
  function plainSummary(ctx) {
    const sky = state.sky; if (!sky) return "";
    const name = ctx.site.name, simMs = ctx.simDate.getTime();
    const parts = [];
    if (sky.sunNow.el > LIT_MIN) {
      const tod = ctx.sunRateDegPerHr > 0.03 ? "morning" : ctx.sunRateDegPerHr < -0.03 ? "afternoon" : "midday";
      parts.push(`It is local ${tod} at ${name}. The Sun is ${sky.sunNow.el.toFixed(0)}° above the ${COMPASS_WORD[cIdx(sky.sunNow.az)]} horizon and ${ctx.sunRateDegPerHr >= -0.01 ? "slowly climbing" : "slowly sinking"}.`);
      if (sky.sunsetMs) parts.push(`Sunset is about ${fmtDur(sky.sunsetMs - simMs)} away — after that comes a long, freezing lunar night.`);
    } else {
      parts.push(`It is night at ${name}: the Sun is below the horizon and the ground is roughly ${ctx.tempK - 273} °C.`);
      if (sky.sunriseMs) parts.push(`The Sun will rise in about ${fmtDur(sky.sunriseMs - simMs)}.`);
    }
    if (sky.earthNow.el > DTE_MIN) parts.push(`Earth is ${sky.earthNow.el.toFixed(0)}° up in the ${COMPASS_WORD[cIdx(sky.earthNow.az)]} sky, so radios can talk straight to mission control.`);
    else if (sky.earthNow.el > 0) parts.push(`Earth is just peeking over the horizon (${sky.earthNow.el.toFixed(1)}°) — too low for a reliable radio link.`);
    else parts.push("Earth is below the horizon here, so the lander would need a relay satellite to talk to Earth.");
    parts.push(ctx.verdictClass === "go" ? "Bottom line: this is a good time to land here."
      : ctx.verdictClass === "nogo" ? "Bottom line: not a good time to land here — try the ☀ Next Sunrise button."
      : "Bottom line: landing is possible but comes with trade-offs (see the verdict above).");
    return "🎓 In plain words: " + parts.join(" ");
  }

  /* ---------------- Toast ---------------- */
  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  /* ---------------- Main hook (called by app.js after every analysis update) ---------------- */
  S.afterUpdate = (ctx) => {
    state.ctx = ctx;
    const ser = getSeries(ctx.simDate.getTime());
    const prof = siteProfile(ctx.site.lat, ctx.site.lon, ser);
    state.prof = prof;

    updateSky(ctx, ser, prof);
    updatePower(ctx, ser, prof);
    if (state.tlMode === "12m") drawSeasons(ctx); else drawTimeline30(ctx, ser, prof);
    renderCompare(ser);
    if (state.view === "2d") drawMap();
    $("plain-summary").textContent = plainSummary(ctx);

    const inp = $("epoch-input");
    if (inp && document.activeElement !== inp) inp.value = ctx.simDate.toISOString().slice(0, 16);
  };

  /* ---------------- UI wiring ---------------- */
  function setSeg(onId, offId) {
    $(onId).classList.add("active"); $(onId).setAttribute("aria-pressed", "true");
    $(offId).classList.remove("active"); $(offId).setAttribute("aria-pressed", "false");
  }

  function setLearn(on) {
    document.body.classList.toggle("learn-mode", on);
    on ? setSeg("mode-learn", "mode-planner") : setSeg("mode-planner", "mode-learn");
    try { localStorage.setItem("selene.mode", on ? "learn" : "planner"); } catch (e) { /* ignore */ }
  }

  function setView(v) {
    state.view = v;
    v === "2d" ? setSeg("view-2d", "view-3d") : setSeg("view-3d", "view-2d");
    $("map2d").hidden = v !== "2d";
    $("map2d-legend").hidden = v !== "2d";
    const labels = $("current-mission-labels");
    if (labels) labels.style.visibility = v === "2d" ? "hidden" : "";
    if (v === "2d") drawMap(); else S.resizeGlobe();
  }

  $("mode-planner").addEventListener("click", () => setLearn(false));
  $("mode-learn").addEventListener("click", () => setLearn(true));
  try { if (localStorage.getItem("selene.mode") === "learn") setLearn(true); } catch (e) { /* ignore */ }

  $("view-3d").addEventListener("click", () => setView("3d"));
  $("view-2d").addEventListener("click", () => setView("2d"));

  $("sky-pano").addEventListener("click", () => { state.skyMode = "pano"; setSeg("sky-pano", "sky-dome"); S.refresh(); });
  $("sky-dome").addEventListener("click", () => { state.skyMode = "dome"; setSeg("sky-dome", "sky-pano"); S.refresh(); });

  $("tl-30d").addEventListener("click", () => { state.tlMode = "30d"; setSeg("tl-30d", "tl-12m"); $("chart-title").textContent = "30-Day Sun & Earth Elevation Timeline"; S.refresh(); });
  $("tl-12m").addEventListener("click", () => { state.tlMode = "12m"; setSeg("tl-12m", "tl-30d"); $("chart-title").textContent = "12-Lunation Seasonal Sunlight & Earth Visibility"; S.refresh(); });

  // Date & time controls
  $("epoch-input").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    const ms = Date.parse(v.length === 16 ? v + ":00Z" : v + "Z");
    if (isFinite(ms)) S.setEpoch(ms); else toast("Could not read that date/time.");
  });
  document.querySelectorAll("[data-step-h]").forEach((b) => {
    b.addEventListener("click", () => S.setEpoch(S.getSimDate().getTime() + Number(b.dataset.stepH) * HOUR));
  });
  $("btn-jump-sunrise").addEventListener("click", () => {
    if (!state.prof || !state.ser) return;
    const c = nextCrossing(state.prof, state.ser, "sun", LIT_MIN, "up");
    if (c.t) S.setEpoch(c.t); else toast("No sunrise at this site within the next 65 days.");
  });
  $("btn-jump-touchdown").addEventListener("click", () => {
    if (!state.prof || !state.ser) return;
    const now = state.ser.simMs;
    const w = windowsFromProfile(state.prof, state.ser).find((x) => x.hasTd && x.tdStart > now + 30 * 60000);
    if (w) S.setEpoch(w.tdStart); else toast("No morning touchdown window within the next 65 days.");
  });

  // Power card requirement input
  const req = $("req-days");
  if (req) req.addEventListener("change", () => { state.reqDays = clamp(Number(req.value) || 10, 1, 60); req.value = state.reqDays; S.refresh(); });

  // Timeline interaction
  const chart = $("solar-chart"), tip = $("chart-tip");
  chart.addEventListener("mousemove", (ev) => {
    const info = chartEventInfo(ev), tl = state.tl;
    if (!info || !tl || !state.prof) { tip.hidden = true; return; }
    let html;
    if (tl.mode === "30d") {
      const h = Math.round(info.f * tl.hours), i = state.ser.i0 + h;
      const s = state.prof.sun[i], e = state.prof.earth[i];
      html = `<b>${fmtDate(tl.startMs + h * HOUR)}</b><br>☀ ${fmtSigned(s)}° · ⊕ ${fmtSigned(e)}°<br>${s > LIT_MIN ? "Sunlit" : "Night"} · ${e > DTE_MIN ? "DTE" : "No DTE"}`;
    } else {
      const k = Math.min(tl.nBuckets - 1, Math.floor(info.f * tl.nBuckets)), b = tl.buckets[k];
      html = `<b>Lunation from ${fmtDate(b.start).slice(0, 10)}</b><br>Sunlit ${(b.lit * 100).toFixed(0)}% · Earth ${(b.dte * 100).toFixed(0)}% · Both ${(b.both * 100).toFixed(0)}%<br>Sub-solar lat ${fmtSigned(b.sLat, 2)}°`;
    }
    tip.innerHTML = html + "<br><i>Click to jump here</i>";
    tip.style.left = `${info.cssX}px`; tip.style.top = `${info.cssY}px`; tip.hidden = false;
  });
  chart.addEventListener("mouseleave", () => { tip.hidden = true; });
  chart.addEventListener("click", (ev) => {
    const info = chartEventInfo(ev), tl = state.tl;
    if (!info || !tl) return;
    if (tl.mode === "30d") S.setEpoch(tl.startMs + Math.round(info.f * tl.hours) * HOUR);
    else S.setEpoch(tl.start + Math.min(tl.nBuckets - 1, Math.floor(info.f * tl.nBuckets)) * tl.bucketMs);
  });

  // 2D map interaction
  const map = $("map2d"), mtip = $("marker-tooltip");
  map.addEventListener("mousemove", (ev) => {
    const c = mapCoords(ev); if (!c || !state.ctx) { mtip.hidden = true; return; }
    const hit = mapHit(c), eph = state.ctx.eph;
    const s = elevOnly(c.lat, c.lon, eph.subsolar_lat, eph.subsolar_lon);
    const e = earthPos(c.lat, c.lon, eph).el;
    mtip.textContent = hit
      ? `${hit.mission.name} (${S.formatCoord(hit.mission.lat, hit.mission.lon)})`
      : `${S.formatCoord(c.lat, c.lon)} · ☀ ${fmtSigned(s)}° · ⊕ ${fmtSigned(e)}°`;
    mtip.style.left = `${c.cssX}px`; mtip.style.top = `${c.cssY}px`; mtip.hidden = false;
  });
  map.addEventListener("mouseleave", () => { mtip.hidden = true; });
  map.addEventListener("click", (ev) => {
    const c = mapCoords(ev); if (!c) return;
    const hit = mapHit(c);
    if (hit) S.selectMission(hit.mission, true); else S.selectCustomCoordinate(c.lat, c.lon, true);
  });

  // Comparison controls
  $("btn-add-compare").addEventListener("click", () => addCompare(S.getSelectedSite()));
  $("cmp-clear").addEventListener("click", () => { state.compare = []; state.cmpIndex = -1; saveCompare(); S.refresh(); });
  $("cmp-prev").addEventListener("click", () => { if (state.compare.length) focusCompare((state.cmpIndex - 1 + state.compare.length) % state.compare.length); });
  $("cmp-next").addEventListener("click", () => { if (state.compare.length) focusCompare((state.cmpIndex + 1) % state.compare.length); });
  $("compare-table").addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-cmp-focus]"), r = ev.target.closest("[data-cmp-remove]");
    if (f) focusCompare(Number(f.dataset.cmpFocus));
    if (r) { state.compare.splice(Number(r.dataset.cmpRemove), 1); saveCompare(); S.refresh(); }
  });

  const EXAMPLE_SET = ["apollo-11", "shackleton", "chang-e-6", "chandrayaan-3"];
  const quick = $("compare-quick");
  quick.innerHTML = `<button type="button" class="mini-btn" id="cmp-example">Load example trade-off set: Apollo 11 · Shackleton Rim · Chang'e-6 (far side) · Chandrayaan-3</button>`;
  $("cmp-example").addEventListener("click", () => {
    state.compare = EXAMPLE_SET.map((id) => S.MISSIONS.find((m) => m.id === id)).filter(Boolean)
      .map((m) => ({ id: m.id, name: m.name, lat: m.lat, lon: m.lon }));
    state.cmpIndex = -1; saveCompare(); S.refresh();
  });
})();
