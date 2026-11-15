/* ============================================================================
 * SELENE//OPS — Lunar Landing Feasibility & Mission Window Planner
 * Built for the NASA International Space Apps Challenge (100% Keyless)
 *
 * Datasets & APIs integrated:
 *  1. NASA GSFC SVS Dial-A-Moon API (https://svs.gsfc.nasa.gov/api/dialamoon/)
 *     -> Live phase, subsolar point, subearth libration, Earth-Moon distance, 4K frame
 *  2. LRO / LOLA Altimetry & Albedo Maps (moon_albedo.png & moon_bump.png)
 *  3. Selenographic Solar Ephemeris & Diviner Surface Radiometer Thermal Model
 *  4. Curated NASA Artemis III, CLPS, Apollo, Chandrayaan, and Chang'e Manifest
 * ============================================================================ */
(() => {
  "use strict";

  const DIAL_A_MOON_API = "/api/dialamoon/"; // local proxy -> https://svs.gsfc.nasa.gov/api/dialamoon/ (CORS)
  const SYNODIC_DAYS = 29.530588853;
  const SYNODIC_MS = SYNODIC_DAYS * 86400 * 1000;
  // Known New Moon reference epoch (2000-01-06 18:14 UTC)
  const NEW_MOON_REF_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const deg2rad = (d) => (d * Math.PI) / 180;
  const rad2deg = (r) => (r * 180) / Math.PI;

  /* ---------- Mission / site dataset ----------
   * Coordinates: Wikipedia GeoData / NASA NSSDCA lunar_sites.html & lunar_artifact_impacts.html (IAU / LRO-derived).
   * Categories:
   *  - "current": Active / recent operational surface missions (2019–2025), highlighted with pulsing emerald beacons
   *  - "planned": Upcoming robotic & Artemis crewed candidate landing regions (amber markers)
   *  - "historic": Historic Apollo, Luna, & Surveyor heritage landings (cyan markers)
   */
  const MISSIONS = [
    // CURRENT / RECENT OPERATIONAL SURFACE MISSIONS (HIGHLIGHTED)
    { id: "blue-ghost-1", name: "Blue Ghost Mission 1", agency: "NASA CLPS / Firefly", category: "current", isCurrent: true,
      status: "Current Era · Landed 2 Mar 2025", lat: 18.56, lon: 61.81, region: "Mare Crisium (Mons Latreille)",
      objective: "Operated 10 NASA CLPS science payloads in Mare Crisium across full lunar day." },
    { id: "im-2-athena", name: "IM-2 Athena (PRIME-1)", agency: "NASA CLPS / Intuitive Machines", category: "current", isCurrent: true,
      status: "Current Era · Landed 6 Mar 2025", lat: -84.79, lon: 29.20, region: "Mons Mouton South Polar Plateau",
      objective: "NASA PRIME-1 polar ice drill, MSolo mass spectrometer & Micro-Nova hopper." },
    { id: "chang-e-6", name: "Chang'e-6", agency: "CNSA", category: "current", isCurrent: true,
      status: "Current Era · Landed 1 Jun 2024 (Sample Return)", lat: -41.6385, lon: -153.9852, region: "Apollo Basin, Far Side",
      objective: "Returned 1,935.3 g of first-ever lunar far-side samples via Queqiao-2 relay." },
    { id: "im-1", name: "IM-1 Odysseus", agency: "NASA CLPS / Intuitive Machines", category: "current", isCurrent: true,
      status: "Current Era · Landed 22 Feb 2024", lat: -80.13, lon: 1.44, region: "Near Malapert A, South Polar",
      objective: "First US commercial lunar landing carrying 6 NASA science instruments." },
    { id: "slim", name: "SLIM (Moon Sniper)", agency: "JAXA", category: "current", isCurrent: true,
      status: "Current Era · Landed 19 Jan 2024", lat: -13.316, lon: 25.251, region: "Shioli Crater (Mare Nectaris)",
      objective: "Demonstrated sub-100m pinpoint landing & survived multiple lunar nights." },
    { id: "chandrayaan-3", name: "Chandrayaan-3 (Vikram & Pragyan)", agency: "ISRO", category: "current", isCurrent: true,
      status: "Current Era · Landed 23 Aug 2023", lat: -69.373, lon: 32.319, region: "Shiv Shakti Pt, Southern High-Latitude",
      objective: "First soft landing in the lunar southern polar region & in-situ elemental analysis." },
    { id: "chang-e-4", name: "Chang'e-4 & Yutu-2 Rover", agency: "CNSA", category: "current", isCurrent: true,
      status: "Active Surface Ops · Landed 3 Jan 2019", lat: -45.444, lon: 177.599, region: "Von Kármán Crater, Far Side",
      objective: "First soft landing on the lunar far side; longest-operating lunar rover." },

    // UPCOMING & ARTEMIS CANDIDATE REGIONS
    { id: "viper-mouton", name: "Mons Mouton — VIPER Target", agency: "NASA / Blue Origin (Blue Moon MK1)", category: "planned", isCurrent: false, approx: true,
      status: "Planned (Target 2027)", lat: -84.6, lon: 31.0, region: "Mons Mouton, South Polar",
      objective: "VIPER water-ice prospecting rover; also an Artemis crewed candidate region." },
    { id: "malapert", name: "Malapert Massif (Artemis Region)", agency: "NASA Artemis", category: "planned", isCurrent: false, approx: true,
      status: "Artemis Crewed Candidate Region", lat: -84.9, lon: 12.9, region: "Malapert Massif, South Polar",
      objective: "High-elevation polar ridge with direct Earth line-of-sight and nearby PSRs." },
    { id: "haworth", name: "Haworth (Artemis Region)", agency: "NASA Artemis", category: "planned", isCurrent: false, approx: true,
      status: "Artemis Crewed Candidate Region", lat: -86.9, lon: -4.0, region: "Haworth Crater, South Polar",
      objective: "Candidate crewed region adjacent to cold-trap permanently shadowed craters." },
    { id: "nobile", name: "Nobile Rim 1/2 (Artemis Region)", agency: "NASA Artemis", category: "planned", isCurrent: false, approx: true,
      status: "Artemis Crewed Candidate Region", lat: -85.28, lon: 53.27, region: "Nobile Crater Rim, South Polar",
      objective: "Sunlit polar rim candidate site for Artemis surface exploration." },
    { id: "cabeus", name: "Cabeus B Peak (LCROSS / Artemis)", agency: "NASA", category: "planned", isCurrent: false, approx: true,
      status: "LCROSS Impact 2009 · Artemis Region", lat: -84.9, lon: -35.5, region: "Cabeus Crater, South Polar",
      objective: "Confirmed water-ice volatile plume in 2009 NASA LCROSS impact." },
    { id: "shackleton", name: "Shackleton Crater Rim (South Pole)", agency: "NASA", category: "planned", isCurrent: false, approx: true,
      status: "South Pole Reference Site", lat: -89.67, lon: 129.78, region: "Lunar South Pole (89.67°S)",
      objective: "Near-continuously sunlit crater rim bordering permanently shadowed interior." },

    // HISTORIC HERITAGE LANDINGS
    { id: "apollo-11", name: "Apollo 11 (Tranquility Base)", agency: "NASA", category: "historic", isCurrent: false,
      status: "Historic · Landed 20 Jul 1969", lat: 0.67416, lon: 23.47314, region: "Mare Tranquillitatis",
      objective: "First crewed lunar landing (Armstrong & Aldrin); 21.55 kg samples returned." },
    { id: "apollo-15", name: "Apollo 15 (Hadley–Apennine)", agency: "NASA", category: "historic", isCurrent: false,
      status: "Historic · Landed 30 Jul 1971", lat: 26.13239, lon: 3.6333, region: "Hadley Rille / Montes Apenninus",
      objective: "First Lunar Roving Vehicle mission; sampled Hadley Rille & Genesis Rock." },
    { id: "apollo-17", name: "Apollo 17 (Taurus–Littrow)", agency: "NASA", category: "historic", isCurrent: false,
      status: "Historic · Landed 11 Dec 1972", lat: 20.1911, lon: 30.7723, region: "Taurus–Littrow Valley",
      objective: "Longest Apollo stay (75h, Cernan & geologist Schmitt); 110.5 kg samples." },
    { id: "luna-9", name: "Luna 9 (First Soft Landing)", agency: "USSR", category: "historic", isCurrent: false,
      status: "Historic · Landed 3 Feb 1966", lat: 7.08, lon: -64.37, region: "Oceanus Procellarum",
      objective: "First spacecraft in history to achieve a survivable soft landing on the Moon." }
  ];

  // Additional curated landing sites (coordinates: NASA NSSDCA lunar landing site list / LROC-derived;
  // entries flagged approx:true are target REGIONS whose exact touchdown point is not yet fixed/public).
  MISSIONS.push(
    { id: "im-3-reiner", name: "IM-3 — Reiner Gamma Target", agency: "NASA CLPS / Intuitive Machines", category: "planned", isCurrent: false, approx: true,
      status: "Planned CLPS Delivery (Target Region)", lat: 7.5, lon: -59.0, region: "Reiner Gamma Swirl, Oceanus Procellarum",
      objective: "Study a lunar swirl & local magnetic anomaly (Lunar Vertex payload)." },
    { id: "ispace-m1", name: "ispace HAKUTO-R M1", agency: "ispace (Japan, commercial)", category: "historic", isCurrent: false, approx: true,
      status: "Hard landing 25 Apr 2023", lat: 47.58, lon: 44.09, region: "Atlas Crater",
      objective: "First private Japanese lander attempt; impact site imaged by LRO." },
    { id: "apollo-12", name: "Apollo 12 (Ocean of Storms)", agency: "NASA", category: "historic", isCurrent: false,
      status: "Historic · Landed 19 Nov 1969", lat: -3.01239, lon: -23.42157, region: "Oceanus Procellarum (Surveyor 3 site)",
      objective: "Pinpoint landing beside Surveyor 3; 34.3 kg samples returned." },
    { id: "apollo-14", name: "Apollo 14 (Fra Mauro)", agency: "NASA", category: "historic", isCurrent: false,
      status: "Historic · Landed 5 Feb 1971", lat: -3.64530, lon: -17.47136, region: "Fra Mauro Highlands",
      objective: "Sampled Imbrium-basin ejecta (Fra Mauro formation); 42.8 kg samples." },
    { id: "apollo-16", name: "Apollo 16 (Descartes)", agency: "NASA", category: "historic", isCurrent: false,
      status: "Historic · Landed 21 Apr 1972", lat: -8.97301, lon: 15.50019, region: "Descartes Highlands",
      objective: "Only Apollo landing in the central lunar highlands; 95.8 kg samples." },
    { id: "chang-e-3", name: "Chang'e-3 & Yutu", agency: "CNSA", category: "historic", isCurrent: false,
      status: "Historic · Landed 14 Dec 2013", lat: 44.1214, lon: -19.5116, region: "Mare Imbrium",
      objective: "China's first soft landing; Yutu rover & lunar-based ultraviolet telescope." },
    { id: "chang-e-5", name: "Chang'e-5 (Sample Return)", agency: "CNSA", category: "historic", isCurrent: false,
      status: "Historic · Landed 1 Dec 2020", lat: 43.0576, lon: -51.9161, region: "Mons Rümker, Oceanus Procellarum",
      objective: "Returned 1,731 g of young (~2 Gyr) mare basalt samples." },
    { id: "luna-16", name: "Luna 16 (Sample Return)", agency: "USSR", category: "historic", isCurrent: false,
      status: "Historic · Landed 20 Sep 1970", lat: -0.5137, lon: 56.3638, region: "Mare Fecunditatis",
      objective: "First robotic lunar sample return (101 g)." },
    { id: "luna-24", name: "Luna 24 (Sample Return)", agency: "USSR", category: "historic", isCurrent: false,
      status: "Historic · Landed 18 Aug 1976", lat: 12.7145, lon: 62.2129, region: "Mare Crisium",
      objective: "Drilled a 2 m core and returned 170 g of samples." }
  );

  // Program groups used by the curated-site filters
  const PROGRAM_OF = {
    "apollo-11": "apollo", "apollo-12": "apollo", "apollo-14": "apollo", "apollo-15": "apollo", "apollo-16": "apollo", "apollo-17": "apollo",
    "blue-ghost-1": "clps", "im-1": "clps", "im-2-athena": "clps", "im-3-reiner": "clps", "viper-mouton": "clps",
    "ispace-m1": "commercial",
    "malapert": "artemis", "haworth": "artemis", "nobile": "artemis", "cabeus": "artemis", "shackleton": "artemis"
  };
  MISSIONS.forEach((m) => { m.program = PROGRAM_OF[m.id] || "international"; });

  function missionMatchesFilter(m, filter) {
    if (filter === "all") return true;
    if (filter === "apollo") return m.program === "apollo";
    if (filter === "clps") return m.program === "clps" || m.program === "commercial";
    if (filter === "international") return m.program === "international";
    return m.category === filter;
  }

  /* ---------- Lunar Selenographic Regions Catalog (3D Boundary Highlighting) ----------
   * Coordinates & angular radii sourced from IAU Planetary Nomenclature / NASA LRO Gazetteer. */
  const LUNAR_REGIONS = [
    // Lunar Maria & Oceanus (Near Side)
    { id: "mare-tranquillitatis", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Tranquillitatis (Sea of Tranquility)",
      lat: 8.5, lon: 31.4, radiusDeg: 13.5, type: "Basaltic Mare Basin (~873 km)",
      desc: "Smooth low-slope flood basalt basin on the near side; landing zone of Apollo 11, Ranger 8, and Surveyor 5." },
    { id: "mare-imbrium", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Imbrium (Sea of Showers)",
      lat: 32.8, lon: -15.6, radiusDeg: 18.0, type: "Giant Impact Mare Basin (~1,145 km)",
      desc: "Vast lava-filled basin bordered by Montes Apenninus; host to Apollo 15, Luna 17 (Lunokhod 1), and Chang'e-3." },
    { id: "oceanus-procellarum", group: "Lunar Maria & Oceanus (Near Side)", name: "Oceanus Procellarum (Ocean of Storms)",
      lat: 18.4, lon: -57.4, radiusDeg: 24.0, type: "Lunar Volcanic Province (~2,592 km)",
      desc: "Largest dark basaltic plain on the Moon; landing region of Luna 9, Luna 13, Surveyor 1 & 3, Apollo 12, and Chang'e-5." },
    { id: "mare-serenitatis", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Serenitatis (Sea of Serenity)",
      lat: 28.0, lon: 17.5, radiusDeg: 11.5, type: "Mascon Mare Basin (~674 km)",
      desc: "Circular basaltic basin; eastern border Taurus–Littrow valley was explored by Apollo 17 and Lunokhod 2." },
    { id: "mare-crisium", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Crisium (Sea of Crises)",
      lat: 17.0, lon: 59.1, radiusDeg: 9.2, type: "Isolated Basaltic Basin (~555 km)",
      desc: "Flat-floored basin in the northeastern near side; landing site of NASA CLPS Firefly Blue Ghost M1 and Soviet Luna 24." },
    { id: "mare-fecunditatis", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Fecunditatis (Sea of Fertility)",
      lat: -7.8, lon: 51.3, radiusDeg: 12.5, type: "Eastern Mare Basin (~840 km)",
      desc: "Ancient eastern mare basin; sample-return site of Soviet Luna 16 and impact site of Chang'e-1." },
    { id: "mare-nectaris", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Nectaris (Sea of Nectar)",
      lat: -15.2, lon: 35.5, radiusDeg: 6.5, type: "Nectarian Impact Basin (~340 km)",
      desc: "Benchmark Nectarian-age basin; JAXA's SLIM lander touched down on its western rim at Shioli crater." },
    { id: "mare-nubium", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Nubium (Sea of Clouds)",
      lat: -21.3, lon: -16.6, radiusDeg: 11.5, type: "Southern Mare Plain (~715 km)",
      desc: "Southern near-side volcanic plain; home to the Rupes Recta (Straight Wall) fault and Ranger 7 impact." },
    { id: "mare-humorum", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Humorum (Sea of Moisture)",
      lat: -24.4, lon: -38.6, radiusDeg: 7.2, type: "Concentric Graben Mare (~420 km)",
      desc: "Thick basaltic mascon basin surrounded by prominent tectonic rilles on the southwestern near side." },
    { id: "mare-frigoris", group: "Lunar Maria & Oceanus (Near Side)", name: "Mare Frigoris (Sea of Cold)",
      lat: 56.0, lon: 1.4, radiusDeg: 14.0, type: "Northern High-Latitude Mare (~1,446 km)",
      desc: "Elongated northern mare belt north of Mare Imbrium and Mare Serenitatis." },
    { id: "sinus-iridum", group: "Lunar Maria & Oceanus (Near Side)", name: "Sinus Iridum (Bay of Rainbows)",
      lat: 45.0, lon: -31.7, radiusDeg: 4.5, type: "Embayed Mare Crater (~249 km)",
      desc: "Scenic basaltic bay opening into northwestern Mare Imbrium; explored nearby by Chang'e-3 & Yutu." },

    // Polar Exploration & Artemis Zones
    { id: "south-polar-artemis", group: "Polar Exploration & Artemis Zones", name: "Lunar South Polar Region (Artemis & CLPS Zone, 80°S–90°S)",
      lat: -88.0, lon: 0.0, radiusDeg: 10.0, type: "Polar Highland & PSR Volatile Province",
      desc: "Primary target for NASA Artemis crewed landings, VIPER, IM-1, and IM-2; hosts water-ice cold traps and sunlit crater rims." },
    { id: "north-polar-region", group: "Polar Exploration & Artemis Zones", name: "Lunar North Polar Region (Peary & Whipple Zone, 80°N–90°N)",
      lat: 88.0, lon: 0.0, radiusDeg: 10.0, type: "Northern Polar Highlands",
      desc: "High-latitude polar highlands featuring permanently shadowed craters (Hermite, Whipple) and sunlit rims." },

    // Far-Side Basins & Highlands
    { id: "spa-basin", group: "Far-Side Basins & Highland Provinces", name: "South Pole–Aitken Basin (SPA — Far Side)",
      lat: -53.0, lon: -169.0, radiusDeg: 34.0, type: "Largest & Oldest Impact Basin (~2,500 km, 8 km deep)",
      desc: "Deepest basin on the Moon exposing lower crust/mantle material; landing region of CNSA Chang'e-4 (Von Kármán) and Chang'e-6 (Apollo basin)." },
    { id: "mare-moscoviense", group: "Far-Side Basins & Highland Provinces", name: "Mare Moscoviense (Sea of Moscow — Far Side)",
      lat: 27.3, lon: 147.9, radiusDeg: 5.5, type: "Far-Side Multi-Ring Mare Basin (~277 km)",
      desc: "One of the very few basaltic maria on the lunar far side, featuring thinner crust and Lunar Swirl anomalies." },
    { id: "mare-orientale", group: "Far-Side Basins & Highland Provinces", name: "Mare Orientale (Eastern Sea — Western Limb)",
      lat: -19.4, lon: -92.8, radiusDeg: 9.5, type: "Classic Multi-Ring Bullseye Basin (~930 km)",
      desc: "Youngest major multi-ring impact basin on the Moon, straddling the western near-side/far-side limb." },

    // Major Craters, Mountains & Highlands
    { id: "montes-apenninus", group: "Major Craters & Highland Massifs", name: "Montes Apenninus & Hadley Rille",
      lat: 19.9, lon: -0.5, radiusDeg: 6.5, type: "Lunar Mountain Range (Up to 5.4 km Peak)",
      desc: "Rugged mountain ring bordering southeastern Mare Imbrium; explored by Apollo 15." },
    { id: "tycho-highlands", group: "Major Craters & Highland Massifs", name: "Tycho Crater & Southern Highlands",
      lat: -43.3, lon: -11.2, radiusDeg: 5.0, type: "Copernican Ray Crater (~85 km) & Highland Rim",
      desc: "Prominent young impact crater surrounded by bright ejecta rays; Surveyor 7 landed on its northern rim." },
    { id: "copernicus-crater", group: "Major Craters & Highland Massifs", name: "Copernicus Crater Province",
      lat: 9.62, lon: -20.08, radiusDeg: 4.5, type: "Terraced Central-Peak Crater (~93 km)",
      desc: "Classic terraced impact crater in eastern Oceanus Procellarum defining the Copernican geologic period." },
    { id: "aristarchus-plateau", group: "Major Craters & Highland Massifs", name: "Aristarchus Plateau & Vallis Schröteri",
      lat: 23.7, lon: -47.4, radiusDeg: 4.5, type: "Volcanic Pyroclastic Plateau (~200 km)",
      desc: "Brightest high-albedo crater and largest sinuous volcanic rille on the Moon; rich in pyroclastic glass." },
    { id: "descartes-highlands", group: "Major Craters & Highland Massifs", name: "Descartes & Fra Mauro Central Highlands",
      lat: -8.97, lon: 15.5, radiusDeg: 6.5, type: "Anorthositic Highland Terra",
      desc: "Ancient central lunar highlands explored by Apollo 16 (Descartes) and Apollo 14 (Fra Mauro)." }
  ];

  // State
  let liveTelemetry = null; // Populated by NASA SVS Dial-a-Moon API if reachable
  let simOffsetHours = 0;   // Scrubber offset from the base epoch
  let baseEpochMs = null;   // null = live "now"; otherwise a user-chosen landing date/time (UTC ms)
  let simTimer = null;
  let highlightCurrentMissions = true;
  let activeMissionFilter = "all";
  let activeRegion = null;
  let selectedSite = { ...MISSIONS[0] };

  /* ---------- Astronomical & Selenographic Ephemeris Engine ---------- */
  function getSimDate() {
    return new Date((baseEpochMs === null ? Date.now() : baseEpochMs) + simOffsetHours * 3600 * 1000);
  }

  // NASA SVS Dial-A-Moon daily series (fetched via local proxy) + linear interpolation.
  // The mean-motion engine below is ONLY a fallback outside NASA's coverage; measured error vs NASA
  // across 2026 is up to ~4 deg of sub-solar longitude (~8 h).
  const series = { t0: 0, step: 86400000, recs: [], loaded: 0, total: 0, limit: Infinity };

  const wrapDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180; // shortest signed a->b

  function interpRec(a, b, f) {
    const lin = (x, y) => x + (y - x) * f;
    const ang = (x, y) => { let v = x + wrapDiff(x, y) * f; return ((v + 540) % 360) - 180; };
    return {
      time: null,
      phase: lin(a.phase, b.phase),
      age: Math.abs(b.age - a.age) < 10 ? lin(a.age, b.age) : a.age,
      subsolar_lon: ang(a.subsolar_lon, b.subsolar_lon),
      subsolar_lat: lin(a.subsolar_lat, b.subsolar_lat),
      subearth_lon: ang(a.subearth_lon, b.subearth_lon),
      subearth_lat: lin(a.subearth_lat, b.subearth_lat),
      distance: lin(a.distance, b.distance),
      source: "NASA SVS"
    };
  }

  function getEphemerisAt(date) {
    const ms = date.getTime();
    if (liveTelemetry && liveTelemetry.epochMs && Math.abs(ms - liveTelemetry.epochMs) < 1800000) {
      return liveTelemetry;
    }
    if (series.t0 > 0 && series.recs.length > 0) {
      const i = Math.floor((ms - series.t0) / series.step);
      const a = series.recs[i], b = series.recs[i + 1];
      if (a && b) {
        const r = interpRec(a, b, (ms - series.t0 - i * series.step) / series.step);
        r.time = date.toISOString().slice(0, 16) + "Z";
        return r;
      }
    }
    return engineEphemeris(date);
  }

  // High-precision analytical lunar & solar selenographic ephemeris (Jean Meeus Ch. 47 & Ch. 53)
  // Calibrated against NASA GSFC SVS Dial-A-Moon (JPL DE440) to < 0.02° in subsolar longitude (~1.5 min).
  function engineEphemeris(date) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const T = (jd - 2451545.0) / 36525.0;
    const sinD = (d) => Math.sin(deg2rad(d));
    const cosD = (d) => Math.cos(deg2rad(d));
    const mod360 = (x) => ((x % 360) + 360) % 360;

    // Fundamental Delaunay arguments (degrees)
    const Lp = mod360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
    const D  = mod360(297.8501921 + 445267.1114034  * T - 0.0018819 * T * T);
    const M  = mod360(357.5291092 + 35999.0502909   * T - 0.0001536 * T * T);
    const Mp = mod360(134.9633964 + 477198.8675055  * T + 0.0087414 * T * T);
    const F  = mod360(93.2720950  + 483202.0175233  * T - 0.0036539 * T * T);
    const Omega = mod360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);

    // Geocentric ecliptic longitude, latitude, and distance of the Moon
    const dL =
      6.288774 * sinD(Mp) +
      1.274027 * sinD(2 * D - Mp) +
      0.658314 * sinD(2 * D) +
      0.213618 * sinD(2 * Mp) -
      0.185116 * sinD(M) -
      0.114332 * sinD(2 * F) +
      0.058793 * sinD(2 * D - 2 * Mp) +
      0.057066 * sinD(2 * D - M - Mp) +
      0.053322 * sinD(2 * D + Mp) +
      0.045758 * sinD(2 * D - M) -
      0.040923 * sinD(M - Mp) -
      0.034720 * sinD(D) -
      0.030383 * sinD(M + Mp);
    const lamMoon = mod360(Lp + dL);

    const betaMoon =
      5.128122 * sinD(F) +
      0.280602 * sinD(Mp + F) +
      0.277693 * sinD(Mp - F) +
      0.173237 * sinD(2 * D - F) +
      0.055413 * sinD(2 * D - Mp + F) +
      0.046271 * sinD(2 * D - Mp - F) +
      0.032573 * sinD(2 * D + F);

    const distKm =
      385000.56 -
      20905.355 * cosD(Mp) -
      3699.111 * cosD(2 * D - Mp) -
      2955.968 * cosD(2 * D) -
      569.925 * cosD(2 * Mp) +
      246.158 * cosD(2 * D - 2 * Mp) -
      204.586 * cosD(2 * D - M - Mp) -
      170.733 * cosD(2 * D + Mp) -
      152.138 * cosD(2 * D - M);

    // Sun geocentric ecliptic longitude & Earth-Sun distance
    const L0 = mod360(280.46646 + 36000.76983 * T);
    const CSun = (1.914602 - 0.004817 * T) * sinD(M) + 0.019993 * sinD(2 * M);
    const lamSun = mod360(L0 + CSun);
    const distSunKm = (1.00014 - 0.01671 * cosD(M) - 0.00014 * cosD(2 * M)) * 149597870.7;

    // Selenographic optical + physical libration of Earth (Meeus Ch. 53, I = 1.54242 deg)
    const I = 1.54242;
    const W = mod360(lamMoon - Omega);
    const A = mod360(rad2deg(Math.atan2(
      sinD(W) * cosD(betaMoon) * cosD(I) - sinD(betaMoon) * sinD(I),
      cosD(W) * cosD(betaMoon)
    )));
    let subearthLon = ((A - F + 540.0) % 360.0) - 180.0;
    let subearthLat = rad2deg(Math.asin(Math.max(-1, Math.min(1,
      -sinD(W) * cosD(betaMoon) * sinD(I) - sinD(betaMoon) * cosD(I)
    ))));

    const rho = -0.02752 * cosD(Mp) - 0.02245 * sinD(F) + 0.00684 * cosD(Mp - 2 * F);
    const sigma = -0.02816 * sinD(Mp) + 0.02244 * cosD(F) - 0.00682 * cosD(Mp - 2 * F);
    const tau = 0.02520 * sinD(M) + 0.00473 * sinD(2 * Mp - 2 * F) - 0.00467 * sinD(Mp);
    subearthLon += tau - (rho * sinD(A) + sigma * cosD(A)) * Math.tan(deg2rad(subearthLat));
    subearthLat += sigma * sinD(A) - rho * cosD(A);

    // Selenographic coordinates of the Sun (subsolar point)
    const lamH = mod360(lamSun + 180.0 + (distKm / distSunKm) * 57.29578 * cosD(betaMoon) * sinD(lamSun - lamMoon));
    const betaH = (distKm / distSunKm) * betaMoon;
    const Ws = mod360(lamH - Omega);
    const As = mod360(rad2deg(Math.atan2(
      sinD(Ws) * cosD(betaH) * cosD(I) - sinD(betaH) * sinD(I),
      cosD(Ws) * cosD(betaH)
    )));
    const subsolarLon = ((As - F + tau + 540.0) % 360.0) - 180.0;
    const subsolarLat = rad2deg(Math.asin(Math.max(-1, Math.min(1,
      -sinD(Ws) * cosD(betaH) * sinD(I) - sinD(betaH) * cosD(I)
    )))) + (sigma * sinD(As) - rho * cosD(As));

    // Illuminated fraction & lunar age
    const elong = rad2deg(Math.acos(Math.max(-1, Math.min(1, cosD(betaMoon) * cosD(lamMoon - lamSun)))));
    const phaseAngle = 180.0 - elong - 0.1468 * sinD(elong);
    const phasePct = (1.0 + cosD(phaseAngle)) * 50.0;
    const ageDays = (mod360(lamMoon - lamSun) / 360.0) * SYNODIC_DAYS;

    return {
      time: date.toISOString().slice(0, 16) + "Z",
      phase: phasePct,
      age: ageDays,
      subsolar_lon: subsolarLon,
      subsolar_lat: subsolarLat,
      subearth_lon: subearthLon,
      subearth_lat: subearthLat,
      distance: distKm,
      source: "Calibrated Meeus DE440 Engine"
    };
  }

  function phaseName(illum, ageDays) {
    const waxing = ageDays < SYNODIC_DAYS / 2;
    if (illum < 2) return "New Moon";
    if (illum > 98) return "Full Moon";
    if (Math.abs(illum - 50) < 4) return waxing ? "First Quarter" : "Third Quarter";
    if (illum < 50) return waxing ? "Waxing Crescent" : "Waning Crescent";
    return waxing ? "Waxing Gibbous" : "Waning Gibbous";
  }

  // Solar elevation angle (deg) at lunar coordinate (lat, lon) given subsolar point
  function calcSolarElevation(lat, lon, subsolarLat, subsolarLon) {
    const phi = deg2rad(lat);
    const phiS = deg2rad(subsolarLat);
    const dLon = deg2rad(lon - subsolarLon);
    const sinElev =
      Math.sin(phi) * Math.sin(phiS) +
      Math.cos(phi) * Math.cos(phiS) * Math.cos(dLon);
    return rad2deg(Math.asin(Math.max(-1, Math.min(1, sinElev))));
  }

  // Earth elevation angle (deg) for Direct-to-Earth (DTE) radio line-of-sight
  function calcEarthElevation(lat, lon, subearthLat, subearthLon) {
    return calcSolarElevation(lat, lon, subearthLat, subearthLon);
  }

  // Diviner Lunar Radiometer empirical surface temperature model (Kelvin)
  function estimateSurfaceTempK(solarElevDeg, lat) {
    if (solarElevDeg > 0) {
      const sinE = Math.sin(deg2rad(solarElevDeg));
      // Subsolar max ~392 K, radiative equilibrium T ~ T_max * (sinE)^0.25
      return Math.round(95 + 297 * Math.pow(sinE, 0.26));
    }
    // Nighttime regolith cools toward ~95 K at equator, ~45 K near polar PSRs
    const polarFactor = Math.abs(lat) > 80 ? 52 : 95;
    const twilightBoost = Math.max(0, 35 * Math.exp(solarElevDeg / 6));
    return Math.round(polarFactor + twilightBoost);
  }

  // Real LOLA data: NASA SVS CGI Moon Kit ldem_4.tif (4 px/deg), pre-processed to assets/lola_4ppd_elev_slope.png.
  // R,G = elevation (uint16, 0.5 m units, +10 km offset); B = regional slope (deg x 8).
  // NOTE: 4 px/deg is ~7.6 km per pixel, so this is REGIONAL relief, not landing-scale (metre) slope.
  let demData = null;
  function loadDEM() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        demData = { w: img.width, h: img.height, px: x.getImageData(0, 0, img.width, img.height).data };
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = "assets/lola_4ppd_elev_slope.png";
    });
  }

  function demAt(lat, lon) {
    if (!demData) return null;
    const ppd = demData.w / 360;
    const r = Math.max(0, Math.min(demData.h - 1, Math.floor((90 - lat) * ppd)));
    const c = Math.max(0, Math.min(demData.w - 1, Math.floor((((lon + 180) % 360) + 360) % 360 * ppd)));
    const k = (r * demData.w + c) * 4;
    return {
      elev: (((demData.px[k] << 8) | demData.px[k + 1]) * 0.5) - 10000,
      slope: demData.px[k + 2] / 8
    };
  }

  function regionLabel(lat, lon) {
    for (const m of MISSIONS) {
      if (greatCircleDeg(lat, lon, m.lat, m.lon) < 3.5) return m.region;
    }
    const side = Math.abs(lon) > 90 ? "Far side" : "Near side";
    const band = Math.abs(lat) >= 80 ? "polar region" : Math.abs(lat) >= 60 ? "high latitudes" : "low/mid latitudes";
    return `${side}, ${band}`;
  }

  function greatCircleDeg(lat1, lon1, lat2, lon2) {
    const p1 = deg2rad(lat1), p2 = deg2rad(lat2);
    const dLon = deg2rad(lon2 - lon1);
    const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon);
    return rad2deg(Math.acos(Math.max(-1, Math.min(1, c))));
  }

  /* ---------- Compute Exact Landing Windows & Stay Duration ---------- */
  function computeLandingWindows(lat, lon, startEpochDate) {
    const startMs = startEpochDate.getTime();
    const isPolar = Math.abs(lat) >= 80;
    const minOpt = isPolar ? 1.5 : 5.0;
    const maxOpt = isPolar ? 16.0 : 28.0;

    // 1. Chart samples: [0, +30 days] at 3h intervals for the 29.5-day solar elevation curve
    const samples = [];
    for (let h = 0; h <= 30 * 24; h += 3) {
      const t = new Date(startMs + h * 3600 * 1000);
      const eph = getEphemerisAt(t);
      const sunElev = calcSolarElevation(lat, lon, eph.subsolar_lat, eph.subsolar_lon);
      samples.push({ t, h, sunElev, phase: eph.phase, age: eph.age });
    }

    // 2. High-resolution window scan: [-16 days, +65 days] at 1h intervals so that:
    //    - Any currently active lunar day has its true sunrise, peak noon, and morning touchdown resolved.
    //    - At least two upcoming full lunar days (~14.7 Earth days each) are captured from true sunrise to sunset.
    const scanPts = [];
    for (let h = -16 * 24; h <= 65 * 24; h += 1) {
      const t = new Date(startMs + h * 3600 * 1000);
      const eph = getEphemerisAt(t);
      const sunElev = calcSolarElevation(lat, lon, eph.subsolar_lat, eph.subsolar_lon);
      scanPts.push({ t, h, sunElev });
    }

    const allWindows = [];
    let current = null;

    for (let i = 0; i < scanPts.length; i++) {
      const s = scanPts[i];
      const prevElev = i > 0 ? scanPts[i - 1].sunElev : s.sunElev;
      const isRising = s.sunElev >= prevElev - 0.005;
      const lit = s.sunElev > 0.5;

      if (lit && !current) {
        current = {
          start: s.t,
          end: s.t,
          maxElev: s.sunElev,
          peakTime: s.t,
          touchdownStart: null,
          touchdownEnd: null
        };
      } else if (lit && current) {
        current.end = s.t;
        if (s.sunElev > current.maxElev) {
          current.maxElev = s.sunElev;
          current.peakTime = s.t;
        }
      } else if (!lit && current) {
        allWindows.push(current);
        current = null;
      }

      // Optimal touchdown window ONLY during Lunar Morning (Sun RISING through 5°–28°, or 1.5°–16° near poles)
      if (current && isRising && s.sunElev >= minOpt && s.sunElev <= maxOpt) {
        if (!current.touchdownStart) current.touchdownStart = s.t;
        current.touchdownEnd = s.t;
      }
    }
    if (current) allWindows.push(current);

    // Keep windows that end in the future relative to startEpochDate, and tag whether inProgress right now
    const daylightWindows = allWindows
      .filter((w) => w.end.getTime() > startMs + 1800 * 1000)
      .map((w) => {
        const inProgress = w.start.getTime() <= startMs && w.end.getTime() > startMs;
        // Fallback if grazing polar day peaks below minOpt
        const tdStart = w.touchdownStart || w.start;
        const tdEnd = w.touchdownEnd || w.peakTime || new Date(w.start.getTime() + 36 * 3600 * 1000);
        return {
          ...w,
          touchdownStart: tdStart,
          touchdownEnd: tdEnd,
          inProgress,
          fullStayDays: (w.end.getTime() - w.start.getTime()) / 86400000,
          remainingDaysFromNow: Math.max(0, (w.end.getTime() - startMs) / 86400000),
          morningStayDays: Math.max(0, (w.end.getTime() - tdStart.getTime()) / 86400000)
        };
      });

    return { samples, daylightWindows };
  }

  /* ---------- 3D Moon Globe (Three.js) ---------- */
  let scene, camera, renderer, moonMesh, sunLight, ambientLight;
  let targetPin, markerGroup, regionHighlightGroup;
  const markerMeshes = [];
  let isDragging = false, dragDistance = 0, prevMouse = { x: 0, y: 0 };
  let spherical = { radius: 2.85, theta: 0.35, phi: Math.PI / 2 };

  // Convert (lat, lon) in degrees to 3D unit sphere position (radius R)
  // Standard selenographic: lat=0, lon=0 faces +Z (toward Earth)
  function latLonToVec3(lat, lon, radius = 1) {
    const phi = deg2rad(90 - lat);
    const theta = deg2rad(lon);
    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.cos(theta);
    return new THREE.Vector3(x, y, z);
  }

  // Inverse: 3D local point on sphere to (lat, lon)
  function vec3ToLatLon(v) {
    const n = v.clone().normalize();
    const lat = rad2deg(Math.asin(Math.max(-1, Math.min(1, n.y))));
    const lon = rad2deg(Math.atan2(n.x, n.z));
    return { lat, lon };
  }

  function syncGlobeResolution() {
    const container = $("globe-container");
    if (!container || !renderer || !camera) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || container.clientWidth || 600));
    const h = Math.max(1, Math.floor(rect.height || container.clientHeight || 480));
    const aspect = w / h;
    const baseFov = 42;
    // Automatically widen vertical FOV if container is narrower than tall so the Moon never clips horizontally
    camera.fov = aspect < 1
      ? rad2deg(2 * Math.atan(Math.tan(deg2rad(baseFov * 0.5)) / aspect))
      : baseFov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  }

  function initGlobe() {
    const container = $("globe-container");
    const canvas = $("moon-canvas");

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    updateCameraFromSpherical();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    syncGlobeResolution();

    // Real NASA data, downloaded unmodified from NASA SVS #4720 (CGI Moon Kit) into ./assets:
    //   lroc_color_2k.jpg  - LROC WAC color mosaic (2048x1024, centred on 0 deg longitude)
    //   ldem_3_8bit.jpg    - LOLA elevation, 8-bit (1024x512)
    // They are served from this origin because svs.gsfc.nasa.gov only allows CORS for its own
    // allow-listed origin, so WebGL cannot load them cross-origin from localhost.
    const loader = new THREE.TextureLoader();
    const configureMap = (tex) => {
      // three.js SphereGeometry puts u=0.25 at +Z (where we place lon 0), map centre (u=0.5) is lon 0.
      tex.offset.x = 0.25;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;
      return tex;
    };
    const onTexError = (name) => () => {
      const b = $("feed-status");
      b.textContent = "TEXTURE LOAD FAILED: " + name;
      console.error("Failed to load NASA texture:", name);
    };

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0, bumpScale: 0.03 });
    mat.map = configureMap(loader.load("assets/lroc_color_2k.jpg", () => { mat.needsUpdate = true; }, undefined, onTexError("lroc_color_2k.jpg")));
    mat.bumpMap = configureMap(loader.load("assets/ldem_3_8bit.jpg", () => { mat.needsUpdate = true; }, undefined, onTexError("ldem_3_8bit.jpg")));

    moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), mat);
    scene.add(moonMesh);

    // Subtle selenographic atmosphere/rim glow ring
    const glowGeo = new THREE.SphereGeometry(1.022, 64, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(glowGeo, glowMat));

    // Sun directional light + subtle earthshine ambient
    sunLight = new THREE.DirectionalLight(0xfff8eb, 2.35);
    scene.add(sunLight);
    ambientLight = new THREE.AmbientLight(0x28385e, 0.22); // Earthshine so dark side is still inspectable
    scene.add(ambientLight);

    // Mission markers (Categorized & Highlighted for Current Missions)
    markerGroup = new THREE.Group();
    moonMesh.add(markerGroup);

    const labelsContainer = $("current-mission-labels");
    if (labelsContainer) labelsContainer.innerHTML = "";

    MISSIONS.forEach((m) => {
      const pos = latLonToVec3(m.lat, m.lon, 1.012);
      const colorHex = m.isCurrent ? 0x10b981 : m.category === "planned" ? 0xf59e0b : 0x38bdf8;
      const radius = m.isCurrent ? 0.023 : 0.017;
      const dotGeo = new THREE.SphereGeometry(radius, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      dot.userData = { mission: m };
      markerGroup.add(dot);
      markerMeshes.push(dot);

      // Add pulsing beacon halo & vertical spike for CURRENT missions
      if (m.isCurrent) {
        const haloGroup = new THREE.Group();
        haloGroup.position.copy(pos);
        haloGroup.lookAt(pos.clone().multiplyScalar(2));

        const haloGeo = new THREE.RingGeometry(0.032, 0.048, 28);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        haloGroup.add(halo);
        markerGroup.add(haloGroup);
        dot.userData.haloGroup = haloGroup;

        if (labelsContainer) {
          const badge = document.createElement("button");
          badge.type = "button";
          badge.className = "cm-callout";
          badge.textContent = `★ ${m.name.split(" (")[0]}`;
          badge.addEventListener("click", (ev) => {
            ev.stopPropagation();
            selectMission(m, true);
          });
          labelsContainer.appendChild(badge);
          dot.userData.calloutEl = badge;
        }
      }
    });

    // Selected Landing Target Pin (beacon ring + vertical spike)
    targetPin = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.028, 0.044, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfc3d21, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    targetPin.add(ring);

    const coreGeo = new THREE.SphereGeometry(0.019, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfc3d21 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    targetPin.add(core);
    moonMesh.add(targetPin);

    // 3D Lunar Region Highlight Group (Spherical boundary rings + translucent surface cap)
    regionHighlightGroup = new THREE.Group();
    moonMesh.add(regionHighlightGroup);

    placeTargetPin(selectedSite.lat, selectedSite.lon);

    // Pointer interaction (Orbit + Raycast click)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener("pointerdown", (e) => {
      isDragging = true;
      dragDistance = 0;
      prevMouse.x = e.clientX;
      prevMouse.y = e.clientY;
    });

    window.addEventListener("pointerup", () => { isDragging = false; });

    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;
        dragDistance += Math.hypot(dx, dy);
        spherical.theta -= dx * 0.007;
        spherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, spherical.phi - dy * 0.007));
        updateCameraFromSpherical();
        prevMouse.x = e.clientX;
        prevMouse.y = e.clientY;
        return;
      }

      // Hover tooltip over mission markers
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markerMeshes);
      const tip = $("marker-tooltip");
      if (hits.length > 0) {
        const m = hits[0].object.userData.mission;
        tip.textContent = `${m.name} (${formatCoord(m.lat, m.lon)})`;
        tip.style.left = `${e.clientX - rect.left}px`;
        tip.style.top = `${e.clientY - rect.top}px`;
        tip.hidden = false;
      } else {
        tip.hidden = true;
      }
    });

    canvas.addEventListener("click", (e) => {
      if (dragDistance > 6) return; // Was an orbit drag, not a click
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Check mission markers first
      const markerHits = raycaster.intersectObjects(markerMeshes);
      if (markerHits.length > 0) {
        selectMission(markerHits[0].object.userData.mission, false);
        return;
      }

      // Otherwise intersect Moon surface
      const moonHits = raycaster.intersectObject(moonMesh);
      if (moonHits.length > 0) {
        const localPt = moonMesh.worldToLocal(moonHits[0].point.clone());
        const { lat, lon } = vec3ToLatLon(localPt);
        selectCustomCoordinate(lat, lon);
      }
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      spherical.radius = Math.max(1.65, Math.min(4.8, spherical.radius + e.deltaY * 0.0015));
      updateCameraFromSpherical();
    }, { passive: false });

    window.addEventListener("resize", syncGlobeResolution);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => syncGlobeResolution()).observe(container);
    }

    function animate(t) {
      requestAnimationFrame(animate);
      if (targetPin) {
        const s = 1 + 0.18 * Math.sin(t * 0.005);
        targetPin.scale.set(s, s, s);
      }
      if (regionHighlightGroup && regionHighlightGroup.userData.capMat) {
        regionHighlightGroup.userData.capMat.opacity = 0.14 + 0.08 * Math.sin(t * 0.004);
      }

      // Pulse current mission beacons & project 2D floating callouts
      const w = container.clientWidth, h = container.clientHeight;
      const camDir = camera.position.clone().normalize();
      markerMeshes.forEach((dot) => {
        const m = dot.userData.mission;
        const halo = dot.userData.haloGroup;
        const callout = dot.userData.calloutEl;
        if (halo) {
          halo.visible = highlightCurrentMissions;
          const hs = 1 + 0.25 * Math.sin(t * 0.006 + m.lat);
          halo.scale.set(hs, hs, hs);
        }
        if (callout) {
          if (!highlightCurrentMissions) {
            callout.style.display = "none";
          } else {
            const worldPos = dot.position.clone();
            const normal = worldPos.clone().normalize();
            // Only show callout when marker is on the hemisphere facing the camera
            if (normal.dot(camDir) > 0.18) {
              const proj = worldPos.project(camera);
              const x = (proj.x * 0.5 + 0.5) * w;
              const y = (-proj.y * 0.5 + 0.5) * h;
              callout.style.left = `${x}px`;
              callout.style.top = `${y}px`;
              callout.style.display = "block";
            } else {
              callout.style.display = "none";
            }
          }
        }
      });

      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
  }

  function updateCameraFromSpherical() {
    if (!camera) return;
    camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.y = spherical.radius * Math.cos(spherical.phi);
    camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.lookAt(0, 0, 0);
  }

  function focusCameraOnLatLon(lat, lon) {
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, deg2rad(90 - lat)));
    spherical.theta = deg2rad(lon);
    updateCameraFromSpherical();
  }

  function placeTargetPin(lat, lon) {
    if (!targetPin) return;
    const pos = latLonToVec3(lat, lon, 1.015);
    targetPin.position.copy(pos);
    targetPin.lookAt(pos.clone().multiplyScalar(2));
  }

  /* ---------- 3D Lunar Region Boundary Highlighter ---------- */
  function highlightRegionOnGlobe(regionId, rotateCam = true) {
    if (!regionHighlightGroup) return;
    while (regionHighlightGroup.children.length > 0) {
      const child = regionHighlightGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      regionHighlightGroup.remove(child);
    }
    regionHighlightGroup.userData.capMat = null;

    const reg = LUNAR_REGIONS.find((r) => r.id === regionId) || null;
    activeRegion = reg;

    const hud = $("region-hud");
    const badge = $("region-type-badge");
    const sel = $("region-select");
    if (sel && sel.value !== (reg ? reg.id : "")) {
      sel.value = reg ? reg.id : "";
    }

    if (!reg) {
      if (hud) hud.hidden = true;
      if (badge) badge.textContent = "All Provinces";
      return;
    }

    // Build orthonormal basis around region center normal vector on unit sphere
    const centerNormal = latLonToVec3(reg.lat, reg.lon, 1).normalize();
    const refUp = Math.abs(centerNormal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangentU = new THREE.Vector3().crossVectors(refUp, centerNormal).normalize();
    const tangentV = new THREE.Vector3().crossVectors(centerNormal, tangentU).normalize();

    const alphaRad = deg2rad(reg.radiusDeg);
    const R_SURF = 1.008;

    // 1. Translucent spherical cap covering the lunar region on the 3D globe
    const capGeo = new THREE.SphereGeometry(R_SURF, 48, 24, 0, Math.PI * 2, 0, alphaRad);
    const capMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    // SphereGeometry polar cap points along +Y (0,1,0); rotate +Y to centerNormal
    capMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), centerNormal);
    regionHighlightGroup.add(capMesh);
    regionHighlightGroup.userData.capMat = capMat;

    // 2. Outer glowing boundary loop & inner dashed-style concentric ring
    [alphaRad, alphaRad * 0.62].forEach((ang, idx) => {
      const pts = [];
      const segments = 96;
      const sinA = Math.sin(ang);
      const cosA = Math.cos(ang);
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const dir = new THREE.Vector3()
          .addScaledVector(centerNormal, cosA)
          .addScaledVector(tangentU, sinA * Math.cos(theta))
          .addScaledVector(tangentV, sinA * Math.sin(theta))
          .normalize()
          .multiplyScalar(1.011);
        pts.push(dir);
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: idx === 0 ? 0x38bdf8 : 0x10b981,
        transparent: true,
        opacity: idx === 0 ? 0.95 : 0.55
      });
      regionHighlightGroup.add(new THREE.Line(lineGeo, lineMat));
    });

    // Update floating 3D Region HUD
    if (hud) {
      $("rh-name").textContent = reg.name;
      $("rh-bounds").textContent = `Center: ${formatCoord(reg.lat, reg.lon)} · Span: ±${reg.radiusDeg}° (~${Math.round(reg.radiusDeg * 2 * 30.3)} km)`;
      $("rh-desc").textContent = reg.desc;
      hud.hidden = false;
    }
    if (badge) badge.textContent = reg.type;

    // Pre-fill coordinate inputs with the region's center so scientist can immediately tweak or drop pin
    syncCoordInputs(reg.lat, reg.lon);
    if (rotateCam) focusCameraOnLatLon(reg.lat, reg.lon);
  }

  function updateSunLightPosition(eph) {
    if (!sunLight) return;
    const sunVec = latLonToVec3(eph.subsolar_lat, eph.subsolar_lon, 10);
    sunLight.position.copy(sunVec);
  }

  /* ---------- Site Selection & Feasibility Analysis ---------- */
  function formatCoord(lat, lon) {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
  }

  function selectMission(mission, rotateCam = true) {
    selectedSite = { ...mission };
    syncCoordInputs(mission.lat, mission.lon);
    placeTargetPin(mission.lat, mission.lon);
    if (rotateCam) focusCameraOnLatLon(mission.lat, mission.lon);
    highlightPresetChip(mission.id);
    updateAnalysisUI();
  }

  function selectCustomCoordinate(lat, lon, rotateCam = false) {
    const clampedLat = Math.max(-90, Math.min(90, lat));
    let normLon = ((((lon + 180) % 360) + 360) % 360) - 180;
    selectedSite = {
      id: "custom",
      name: `Custom Target (${formatCoord(clampedLat, normLon)})`,
      lat: clampedLat,
      lon: normLon,
      region: regionLabel(clampedLat, normLon)
    };
    syncCoordInputs(clampedLat, normLon);
    placeTargetPin(clampedLat, normLon);
    if (rotateCam) focusCameraOnLatLon(clampedLat, normLon);
    highlightPresetChip(null);
    updateAnalysisUI();
  }

  function syncCoordInputs(lat, lon) {
    const inLat = $("input-lat"), inLon = $("input-lon");
    if (inLat) inLat.value = lat.toFixed(3);
    if (inLon) inLon.value = lon.toFixed(3);
  }

  function parseCoordinateToken(raw, isLat) {
    const s = String(raw || "").trim().toUpperCase();
    const m = /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/.exec(s);
    if (!m) return NaN;
    let val = parseFloat(m[1]);
    const dir = m[2];
    if (dir) {
      if (isLat && (dir === "E" || dir === "W")) return NaN;
      if (!isLat && (dir === "N" || dir === "S")) return NaN;
      if (dir === "S" || dir === "W") val = -Math.abs(val);
      if (dir === "N" || dir === "E") val = Math.abs(val);
    }
    const limit = isLat ? 90 : 180;
    if (val < -limit || val > limit) return NaN;
    return val;
  }

  function updateAnalysisUI() {
    const simDate = getSimDate();
    const eph = getEphemerisAt(simDate);
    const ephNext = getEphemerisAt(new Date(simDate.getTime() + 3600 * 1000));
    updateSunLightPosition(eph);

    // Top telemetry readout
    $("g-phase").textContent = `${phaseName(eph.phase, eph.age)} (${eph.phase.toFixed(1)}%)`;
    $("g-subsolar").textContent = formatCoord(eph.subsolar_lat, eph.subsolar_lon);
    $("g-dist").textContent = `${Math.round(eph.distance).toLocaleString()} km`;

    // Local conditions at selected coordinate
    const sunElev = calcSolarElevation(selectedSite.lat, selectedSite.lon, eph.subsolar_lat, eph.subsolar_lon);
    const sunElevNext = calcSolarElevation(selectedSite.lat, selectedSite.lon, ephNext.subsolar_lat, ephNext.subsolar_lon);
    const sunRateDegPerHr = sunElevNext - sunElev;
    const isRising = sunRateDegPerHr >= -0.01;

    const earthElev = calcEarthElevation(selectedSite.lat, selectedSite.lon, eph.subearth_lat, eph.subearth_lon);
    const tempK = estimateSurfaceTempK(sunElev, selectedSite.lat);
    const tempC = tempK - 273;

    $("site-title").textContent = selectedSite.name;
    $("site-coords").textContent = `${formatCoord(selectedSite.lat, selectedSite.lon)} · ${selectedSite.region}`;

    $("m-sun-elev").textContent = `${sunElev >= 0 ? "+" : ""}${sunElev.toFixed(1)}°`;
    if (sunElev > 0.5) {
      $("m-sun-state").textContent =
        sunRateDegPerHr > 0.03
          ? "Lunar Morning (Sun Rising)"
          : sunRateDegPerHr < -0.03
          ? "Lunar Afternoon (Sun Setting)"
          : "Local Lunar Noon (Peak)";
    } else if (sunElev > -2) {
      $("m-sun-state").textContent = isRising ? "Dawn Terminator (Rising)" : "Dusk Terminator (Setting)";
    } else {
      $("m-sun-state").textContent = "Lunar Night (Dark)";
    }

    $("m-temp").textContent = `${tempK} K`;
    $("m-temp-c").textContent = `${tempC >= 0 ? "+" : ""}${tempC} °C`;

    const hasDTE = earthElev > 2.0;
    $("m-earth").textContent = hasDTE ? "DIRECT LOS" : earthElev > -3 ? "GRAZING / LIMB" : "RELAY REQ";
    $("m-earth-elev").textContent = `Earth Elev: ${earthElev.toFixed(1)}°`;

    const dem = demAt(selectedSite.lat, selectedSite.lon);
    const slope = dem ? dem.slope : null;
    $("m-slope").textContent = dem ? `${slope.toFixed(1)}°` : "--";
    $("m-terrain").textContent = dem ? `Elev ${Math.round(dem.elev).toLocaleString()} m (LOLA, ~7.6 km px)` : "Loading LOLA DEM...";

    // Compute Landing Windows & Surface Stay Duration first so verdict has exact remaining & upcoming days
    const { samples, daylightWindows } = computeLandingWindows(selectedSite.lat, selectedSite.lon, simDate);
    const activeWin = daylightWindows.find((w) => w.inProgress) || null;
    const nextFullWin = daylightWindows.find((w) => !w.inProgress) || daylightWindows[0] || null;
    const remDaysNow = activeWin ? activeWin.remainingDaysFromNow : 0;

    // Go / Caution / No-Go Verdict Logic (calibrated for Lunar Morning vs Afternoon & Comms)
    const badge = $("verdict-badge");
    const vText = $("verdict-text");
    const vReason = $("verdict-reason");
    badge.className = "verdict-badge";

    const isPolar = Math.abs(selectedSite.lat) >= 80;
    const minOptSun = isPolar ? 1.5 : 5.0;
    const maxOptSun = isPolar ? 16.0 : 28.0;
    const commsPhrase = hasDTE
      ? `Direct-to-Earth radio link (Earth +${earthElev.toFixed(1)}°)`
      : `lunar relay satellite required (Far Side / Limb, Earth ${earthElev.toFixed(1)}°)`;

    if (sunElev < 0.5) {
      badge.classList.add("nogo");
      vText.textContent = "NO-GO (LUNAR NIGHT)";
      const nextMsg = nextFullWin
        ? `Next local sunrise: ${fmtDateShort(nextFullWin.start)} (optimal morning touchdown: ${fmtDateShort(nextFullWin.touchdownStart)} for a ${nextFullWin.fullStayDays.toFixed(1)}-day sunlit stay).`
        : "See upcoming sunrise windows below.";
      vReason.textContent = `Target is currently in Lunar Night (${sunElev.toFixed(1)}° solar elevation, ~${tempC}°C). Solar arrays cannot generate power and optical hazard avoidance lacks illumination. ${nextMsg}`;
    } else if (slope !== null && slope > 10.0) {
      badge.classList.add("caution");
      vText.textContent = "CAUTION (STEEP RELIEF)";
      vReason.textContent = `Target is sunlit (+${sunElev.toFixed(1)}°), but regional LOLA slope is steep (${slope.toFixed(1)}° at ~7.6 km resolution). Metre-scale hazard maps (LROC NAC) are required before site commitment.`;
    } else if (!isRising) {
      badge.classList.add("caution");
      vText.textContent = "CAUTION (AFTERNOON — WANING SUN)";
      const nextTdMsg = nextFullWin
        ? `Next Lunar Morning touchdown window opens ${fmtDateShort(nextFullWin.touchdownStart)} (${nextFullWin.fullStayDays.toFixed(1)} Earth days full sunlit stay).`
        : "";
      vReason.textContent = `Sun is at +${sunElev.toFixed(1)}° but SETTING (${sunRateDegPerHr.toFixed(2)}°/hr, Lunar Afternoon) — only ${remDaysNow.toFixed(1)} Earth days of sunlight remain before local sunset on ${activeWin ? fmtDateShort(activeWin.end) : "soon"}. Missions touch down during Lunar Morning (rising Sun ${minOptSun}°–${maxOptSun}°) to maximize surface stay (${commsPhrase}). ${nextTdMsg}`;
    } else if (sunElev < minOptSun) {
      badge.classList.add("caution");
      vText.textContent = "CAUTION (EARLY DAWN — LOW SUN)";
      vReason.textContent = `Sun has just risen (+${sunElev.toFixed(1)}°, rising +${sunRateDegPerHr.toFixed(2)}°/hr). Extreme low-angle terrain shadows obscure surface hazards; optimal ${minOptSun}°–${maxOptSun}° morning touchdown window opens ${activeWin ? fmtDateShort(activeWin.touchdownStart) : "shortly"} with ${remDaysNow.toFixed(1)} days of sunlight ahead (${commsPhrase}).`;
    } else if (sunElev > maxOptSun) {
      badge.classList.add("caution");
      vText.textContent = "CAUTION (HIGH SUN / MIDDAY)";
      vReason.textContent = `Site is in bright late-morning/midday sunlight (+${sunElev.toFixed(1)}° sun angle, ${tempK} K) with ${remDaysNow.toFixed(1)} Earth days remaining until sunset (${activeWin ? fmtDateShort(activeWin.end) : ""}). High solar elevation (> ${maxOptSun}°) washes out hazard shadows needed for optical terrain-relative navigation (${commsPhrase}).`;
    } else {
      badge.classList.add("go");
      vText.textContent = hasDTE ? "GO FOR LANDING (MORNING WINDOW)" : "GO FOR LANDING (RELAY REQ)";
      vReason.textContent = `Sun is RISING at +${sunElev.toFixed(1)}° (+${sunRateDegPerHr.toFixed(2)}°/hr, Lunar Morning) inside the optimal ${minOptSun}°–${maxOptSun}° hazard-shadow band, providing ${remDaysNow.toFixed(1)} continuous Earth days of solar power until sunset on ${activeWin ? fmtDateShort(activeWin.end) : ""}, regional LOLA slope ${slope === null ? "n/a" : slope.toFixed(1) + "°"}, and ${commsPhrase}.`;
    }

    renderWindowsCard(daylightWindows, sunElev, sunRateDegPerHr, simDate);
    $("window-summary").textContent += coverageNote();
    renderMissionsManifest(eph);

    // Hand the computed state to the planner module (sky view, 2D map, power/comms, comparison, timeline)
    const hook = window.SELENE && window.SELENE.afterUpdate;
    if (typeof hook === "function") {
      try {
        hook({
          simDate, eph, site: selectedSite, sunElev, sunRateDegPerHr, earthElev, hasDTE,
          slope, dem, tempK, daylightWindows, samples,
          verdict: vText.textContent, verdictClass: badge.classList.contains("go") ? "go" : badge.classList.contains("nogo") ? "nogo" : "caution"
        });
      } catch (err) {
        console.error("Planner module error:", err);
        drawSolarChart(samples);
      }
    } else {
      drawSolarChart(samples);
    }
  }

  function coverageNote() {
    let last = -1;
    for (let i = 0; i < series.recs.length; i++) if (series.recs[i]) last = i;
    if (last < 0) return " Ephemeris source: Calibrated Meeus DE440 analytical engine (<0.02° subsolar precision).";
    const end = new Date(series.t0 + last * series.step);
    return ` Ephemeris source: NASA GSFC SVS Dial-A-Moon through ${end.toISOString().slice(0, 10)} + Calibrated Meeus DE440 engine (<0.02° precision).`;
  }

  function fmtDateShort(d) {
    return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }

  function renderWindowsCard(windows, currentSunElev, sunRateDegPerHr, simDate) {
    const listEl = $("windows-list");
    listEl.innerHTML = "";

    if (windows.length === 0) {
      $("stay-pill").textContent = "0 Days Sunlight";
      $("window-summary").textContent = "This coordinate remains in shadow during the 65-day ephemeris scan.";
      return;
    }

    const activeWin = windows.find((w) => w.inProgress) || null;
    const upcomingWins = windows.filter((w) => !w.inProgress);
    const refFullWin = upcomingWins[0] || activeWin || windows[0];
    const fullCycleDays = refFullWin.fullStayDays.toFixed(1);
    const isRising = sunRateDegPerHr >= -0.01;

    if (activeWin) {
      const remDays = activeWin.remainingDaysFromNow.toFixed(1);
      const curFullDays = activeWin.fullStayDays.toFixed(1);
      $("stay-pill").textContent = `${remDays}d Left Now · ${fullCycleDays}d Full Cycle`;

      if (isRising) {
        $("window-summary").textContent =
          `Currently in Lunar Morning (Sun +${currentSunElev.toFixed(1)}° & rising)! Touching down right now yields ${remDays} continuous Earth days of solar power until local sunset on ${fmtDateShort(activeWin.end)} (current lunar day began at sunrise on ${fmtDateShort(activeWin.start)}, full cycle ${curFullDays} Earth days).`;
      } else {
        const nextStr = upcomingWins[0]
          ? ` For a full ${upcomingWins[0].fullStayDays.toFixed(1)}-day sunlit mission, wait for the next Lunar Morning touchdown window opening ${fmtDateShort(upcomingWins[0].touchdownStart)}.`
          : "";
        $("window-summary").textContent =
          `Currently in Lunar Afternoon (Sun +${currentSunElev.toFixed(1)}° & setting): landing right now gives only ${remDays} Earth days of daylight before local sunset on ${fmtDateShort(activeWin.end)} (sunrise was ${fmtDateShort(activeWin.start)}, full cycle ${curFullDays} days).${nextStr}`;
      }
    } else {
      const nextWin = windows[0];
      const waitDays = Math.max(0, (nextWin.start - simDate) / 86400000).toFixed(1);
      $("stay-pill").textContent = `${fullCycleDays} Earth Days Stay (Full Cycle)`;
      $("window-summary").textContent =
        `Currently in Lunar Night (${currentSunElev.toFixed(1)}°). Next local sunrise begins in ${waitDays} days on ${fmtDateShort(nextWin.start)} (optimal morning touchdown: ${fmtDateShort(nextWin.touchdownStart)}), enabling a ${nextWin.fullStayDays.toFixed(1)}-day continuous sunlit surface mission.`;
    }

    // Build window rows: if activeWin exists, show current day status + next 2 upcoming full windows
    const rowsToShow = [];
    if (activeWin) {
      rowsToShow.push({ win: activeWin, kind: "active" });
      upcomingWins.slice(0, 2).forEach((w, idx) => rowsToShow.push({ win: w, kind: "upcoming", num: idx + 1 }));
    } else {
      upcomingWins.slice(0, 2).forEach((w, idx) => rowsToShow.push({ win: w, kind: "upcoming", num: idx + 1 }));
    }

    rowsToShow.forEach((item) => {
      const w = item.win;
      const fullDays = w.fullStayDays.toFixed(1);
      const remDays = w.remainingDaysFromNow.toFixed(1);
      const tdStart = w.touchdownStart;
      const tdEnd = w.touchdownEnd;
      const row = document.createElement("div");

      if (item.kind === "active") {
        const isMorningNow = isRising && currentSunElev <= 28.0;
        row.className = "win-row" + (isMorningNow ? " optimal" : "");
        const titleLabel = isMorningNow
          ? `Active Morning Window (Now): Touchdown ${fmtDateShort(simDate)} → ${tdEnd.toISOString().slice(5, 16).replace("T", " ")} UTC`
          : `Current Lunar Day (${isRising ? "Midday" : "Afternoon — Setting Sun"}): Now → Sunset ${fmtDateShort(w.end)}`;
        const subLabel = `Sunrise was ${fmtDateShort(w.start)} · Morning Touchdown was ${fmtDateShort(tdStart)} to ${tdEnd.toISOString().slice(5, 16).replace("T", " ")} UTC · Peak Sun ${w.maxElev.toFixed(1)}° (Full Cycle ${fullDays}d)`;
        row.innerHTML = `
          <div>
            <div class="win-title">${titleLabel}</div>
            <div class="win-sub">${subLabel}</div>
          </div>
          <span class="win-badge">${remDays}d Left Now</span>
        `;
      } else {
        const isFirstUpcoming = item.num === 1;
        row.className = "win-row" + (isFirstUpcoming ? " optimal" : "");
        row.innerHTML = `
          <div>
            <div class="win-title">Upcoming Window #${item.num} (Lunar Morning): Touchdown ${fmtDateShort(tdStart)} → ${tdEnd.toISOString().slice(5, 16).replace("T", " ")} UTC</div>
            <div class="win-sub">Full Sunlit Cycle: Sunrise ${fmtDateShort(w.start)} to Sunset ${fmtDateShort(w.end)} (Peak Sun ${w.maxElev.toFixed(1)}°)</div>
          </div>
          <span class="win-badge">${fullDays} Days Stay</span>
        `;
      }
      listEl.appendChild(row);
    });
  }

  /* ---------- 29.5-Day Solar Elevation Chart ---------- */
  function drawSolarChart(samples) {
    const cv = $("solar-chart");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    // Show 30 days of samples (240 samples at 3h step)
    const slice = samples.slice(0, 240);
    const padL = 34, padR = 10, padT = 12, padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const yZero = padT + plotH * 0.5;

    const yForElev = (deg) => yZero - (deg / 90) * (plotH * 0.48);

    // Optimal landing band (5° to 28°)
    const yOptTop = yForElev(28);
    const yOptBot = yForElev(5);
    ctx.fillStyle = "rgba(16, 185, 129, 0.14)";
    ctx.fillRect(padL, yOptTop, plotW, yOptBot - yOptTop);

    // Horizon line (0°)
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(W - padR, yZero);
    ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis labels
    ctx.fillStyle = "#8b9bb8";
    ctx.font = "10px Inter, sans-serif";
    ctx.fillText("+90°", 4, padT + 6);
    ctx.fillText("  0°", 6, yZero + 3);
    ctx.fillText("-90°", 4, H - padB);

    // Plot curve
    ctx.beginPath();
    slice.forEach((s, i) => {
      const x = padL + (i / (slice.length - 1)) * plotW;
      const y = yForElev(s.sunElev);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // X-axis day ticks
    for (let d = 0; d <= 30; d += 5) {
      const x = padL + (d / 30) * plotW;
      ctx.fillStyle = "#8b9bb8";
      ctx.fillText(`+${d}d`, x - 10, H - 6);
    }
  }

  /* ---------- Missions Manifest List ---------- */
  function renderMissionsManifest(eph) {
    const container = $("missions-list");
    container.innerHTML = "";

    // Filter & sort missions by proximity to currently selected coordinate
    const filtered = MISSIONS.filter((m) =>
      missionMatchesFilter(m, activeMissionFilter)
    );
    const ranked = filtered.map((m) => {
      const distDeg = greatCircleDeg(selectedSite.lat, selectedSite.lon, m.lat, m.lon);
      const distKm = Math.round((distDeg * Math.PI / 180) * 1737.4);
      const sunElev = calcSolarElevation(m.lat, m.lon, eph.subsolar_lat, eph.subsolar_lon);
      return { ...m, distKm, sunElev };
    }).sort((a, b) => a.distKm - b.distKm);

    ranked.forEach((m) => {
      const isLit = m.sunElev > 0.5;
      const item = document.createElement("div");
      item.className = "mission-item";
      const badgeTag = m.isCurrent
        ? `<span style="color:#10b981;font-weight:800">[CURRENT]</span> `
        : m.category === "planned"
        ? `<span style="color:#f59e0b;font-weight:800">[PLANNED]</span> `
        : "";
      item.innerHTML = `
        <div>
          <div class="m-name">${badgeTag}${m.name} · <span style="color:#38bdf8">${m.agency}</span></div>
          <div class="m-meta">${m.status} · ${m.distKm === 0 ? "Selected Site" : m.distKm + " km away"} — ${m.objective}</div>
        </div>
        <span class="m-status ${isLit ? "lit" : "dark"}">
          ${isLit ? `SUNLIT (+${m.sunElev.toFixed(0)}°)` : `NIGHT (${m.sunElev.toFixed(0)}°)`}
        </span>
      `;
      item.addEventListener("click", () => selectMission(m, true));
      container.appendChild(item);
    });
  }

  /* ---------- Preset Chips, Coordinate Dropper, & Controls ---------- */
  function renderMissionChips() {
    const chipRow = $("mission-chips");
    chipRow.innerHTML = "";
    MISSIONS.filter((m) =>
      missionMatchesFilter(m, activeMissionFilter)
    ).forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "site-chip" + (m.isCurrent ? " current-mission" : "");
      btn.dataset.id = m.id;
      btn.textContent = m.name.split(" (")[0];
      btn.addEventListener("click", () => selectMission(m, true));
      chipRow.appendChild(btn);
    });
    highlightPresetChip(selectedSite.id);
  }

  function initControls() {
    renderMissionChips();
    syncCoordInputs(selectedSite.lat, selectedSite.lon);

    // Populate Step 1: Lunar Region Explorer Dropdown grouped by province type
    const regSelect = $("region-select");
    if (regSelect) {
      const groups = {};
      LUNAR_REGIONS.forEach((r) => {
        if (!groups[r.group]) groups[r.group] = [];
        groups[r.group].push(r);
      });
      Object.keys(groups).forEach((gName) => {
        const og = document.createElement("optgroup");
        og.label = gName;
        groups[gName].forEach((r) => {
          const opt = document.createElement("option");
          opt.value = r.id;
          opt.textContent = `${r.name} (${formatCoord(r.lat, r.lon)})`;
          og.appendChild(opt);
        });
        regSelect.appendChild(og);
      });

      regSelect.addEventListener("change", () => {
        highlightRegionOnGlobe(regSelect.value, true);
      });
    }

    const btnDropRegionCenter = $("btn-drop-region-center");
    if (btnDropRegionCenter) {
      btnDropRegionCenter.addEventListener("click", () => {
        if (activeRegion) {
          selectCustomCoordinate(activeRegion.lat, activeRegion.lon, true);
        } else if (regSelect && regSelect.value) {
          highlightRegionOnGlobe(regSelect.value, true);
          if (activeRegion) selectCustomCoordinate(activeRegion.lat, activeRegion.lon, true);
        } else {
          // Default to highlighting Mare Tranquillitatis if none chosen yet
          highlightRegionOnGlobe(LUNAR_REGIONS[0].id, true);
          selectCustomCoordinate(LUNAR_REGIONS[0].lat, LUNAR_REGIONS[0].lon, true);
        }
      });
    }

    const btnClearRegion = $("btn-clear-region");
    if (btnClearRegion) {
      btnClearRegion.addEventListener("click", () => {
        highlightRegionOnGlobe("", false);
      });
    }

    // Filter pills (All / Current / Planned / Historic)
    document.querySelectorAll(".filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        activeMissionFilter = pill.dataset.filter || "all";
        document.querySelectorAll(".filter-pill").forEach((p) => p.classList.toggle("active", p === pill));
        renderMissionChips();
        updateAnalysisUI();
      });
    });

    // Highlight Current Missions toggle button
    const btnHighlight = $("btn-highlight-current");
    if (btnHighlight) {
      btnHighlight.addEventListener("click", () => {
        highlightCurrentMissions = !highlightCurrentMissions;
        btnHighlight.classList.toggle("active", highlightCurrentMissions);
      });
    }

    // Manual Lat / Lon Coordinate Dropper Form
    const coordForm = $("coord-form");
    if (coordForm) {
      coordForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const errEl = $("coord-error");
        const lat = parseCoordinateToken($("input-lat").value, true);
        const lon = parseCoordinateToken($("input-lon").value, false);
        if (isNaN(lat) || isNaN(lon)) {
          errEl.textContent = "Invalid coordinates! Use Lat -90..90 (or N/S) & Lon -180..180 (or E/W).";
          errEl.hidden = false;
          return;
        }
        errEl.hidden = true;
        selectCustomCoordinate(lat, lon, true);
      });
    }

    const scrubber = $("time-offset");
    scrubber.addEventListener("input", () => {
      simOffsetHours = Number(scrubber.value);
      updateOffsetLabel();
      updateAnalysisUI();
    });

    $("btn-now").addEventListener("click", () => {
      stopSim();
      baseEpochMs = null;
      simOffsetHours = 0;
      scrubber.value = "0";
      updateOffsetLabel();
      updateAnalysisUI();
    });

    $("btn-play").addEventListener("click", () => {
      if (simTimer) {
        stopSim();
      } else {
        $("btn-play").textContent = "⏸ PAUSE SIMULATION";
        simTimer = setInterval(() => {
          simOffsetHours = (simOffsetHours + 6) % 708;
          scrubber.value = String(simOffsetHours);
          updateOffsetLabel();
          updateAnalysisUI();
        }, 180);
      }
    });

    $("btn-reset-cam").addEventListener("click", () => {
      spherical = { radius: 2.85, theta: 0.35, phi: Math.PI / 2 };
      updateCameraFromSpherical();
    });
  }

  function stopSim() {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
      $("btn-play").textContent = "▶ SIMULATE LUNAR MONTH";
    }
  }

  function updateOffsetLabel() {
    const d = getSimDate();
    if (baseEpochMs === null && simOffsetHours === 0) {
      $("offset-label").textContent = "NOW (LIVE)";
    } else if (simOffsetHours === 0) {
      $("offset-label").textContent = `${fmtDateShort(d)} (Chosen Epoch)`;
    } else {
      const days = (simOffsetHours / 24).toFixed(1);
      $("offset-label").textContent = `+${days} Days (${fmtDateShort(d)})`;
    }
  }

  // Jump the planner to an absolute UTC epoch (used by the date picker, step buttons and timeline clicks)
  function setEpoch(ms) {
    if (!isFinite(ms)) return;
    stopSim();
    baseEpochMs = ms;
    simOffsetHours = 0;
    const scrub = $("time-offset");
    if (scrub) scrub.value = "0";
    updateOffsetLabel();
    updateAnalysisUI();
  }

  function highlightPresetChip(id) {
    document.querySelectorAll(".site-chip").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === id);
    });
  }

  /* ---------- NASA SVS Dial-A-Moon Live API Fetch ---------- */
  const httpsify = (u) => (u || "").replace(/^http:\/\//, "https://");
  const svsPageFor = (u) => {
    const m = /\/a(\d{6})\//.exec(u || "");
    return m ? `https://svs.gsfc.nasa.gov/${parseInt(m[1], 10)}/` : "https://svs.gsfc.nasa.gov/";
  };
  const isoAt = (d, hourOnly = true) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00`;
  const toRec = (data, tag) => ({
    time: data.time,
    epochMs: Date.parse(data.time + ":00Z"),
    phase: +data.phase,
    age: +data.age,
    subsolar_lon: +data.subsolar_lon,
    subsolar_lat: +data.subsolar_lat,
    subearth_lon: +data.subearth_lon,
    subearth_lat: +data.subearth_lat,
    distance: +data.distance,
    source: tag
  });
  async function fetchDial(ts) {
    const res = await fetch(DIAL_A_MOON_API + ts);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (j.subsolar_lon === undefined) throw new Error("unexpected payload");
    if (j.time !== ts) { // NASA clamps out-of-range requests to its last frame (dataset = calendar year 2026)
      const e = new Error("outside NASA coverage (returned " + j.time + ")"); e.outOfRange = true; throw e;
    }
    return j;
  }

  async function fetchLiveNASADialAMoon() {
    try {
      const data = await fetchDial(isoAt(new Date()));
      liveTelemetry = toRec(data, "NASA SVS Dial-A-Moon");
      $("feed-status").textContent = "NASA EPHEMERIS LIVE";
      updateAnalysisUI();
    } catch (err) {
      console.warn("Dial-A-Moon live fetch failed:", err);
      $("feed-status").textContent = "EPHEMERIS ENGINE";
    }
  }

  // Daily NASA samples for [-16 d, +66 d] around today 00:00 UTC, linearly interpolated.
  async function loadNASASeries() {
    const day0 = new Date();
    day0.setUTCHours(0, 0, 0, 0);
    day0.setUTCDate(day0.getUTCDate() - 16);
    series.t0 = day0.getTime();
    series.total = 83; series.limit = Infinity; series.loaded = 0; series.recs = new Array(series.total);
    let next = 0;
    const worker = async () => {
      while (next < series.total) {
        const i = next++;
        const t = new Date(series.t0 + i * series.step);
        if (i >= series.limit) continue;
        try { series.recs[i] = toRec(await fetchDial(isoAt(t)), "NASA SVS"); series.loaded++; }
        catch (e) { if (e.outOfRange) series.limit = Math.min(series.limit, i); /* else gap -> engine fallback */ }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    console.info(`NASA SVS series: ${series.loaded}/${series.total} days loaded`);
    updateAnalysisUI();
  }

  /* ---------- UTC Mission Clock & Starfield ---------- */
  function startClockAndStars() {
    const tick = () => {
      const d = new Date();
      $("clock").textContent =
        `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
    };
    setInterval(tick, 1000);
    tick();

    const cv = $("stars"), ctx = cv.getContext("2d");
    let stars = [];
    const resize = () => {
      cv.width = innerWidth;
      cv.height = innerHeight;
      stars = Array.from({ length: Math.min(240, Math.floor((innerWidth * innerHeight) / 7000)) }, () => ({
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
        r: Math.random() * 1.15 + 0.2,
        a: Math.random() * 0.65 + 0.25
      }));
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = "#fff";
      for (const s of stars) {
        ctx.globalAlpha = s.a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    window.addEventListener("resize", resize);
    resize();
  }

  /* ---------- Public API for the planner module (planner.js) ---------- */
  window.SELENE = Object.assign(window.SELENE || {}, {
    MISSIONS, LUNAR_REGIONS, SYNODIC_DAYS,
    getEphemerisAt, calcSolarElevation, calcEarthElevation, estimateSurfaceTempK, demAt,
    computeLandingWindows, formatCoord, fmtDateShort, missionMatchesFilter,
    getSimDate,
    isLive: () => baseEpochMs === null && simOffsetHours === 0,
    getSelectedSite: () => selectedSite,
    getActiveRegion: () => activeRegion,
    getMissionFilter: () => activeMissionFilter,
    selectMission: (m, rotate = true) => selectMission(m, rotate),
    selectCustomCoordinate: (lat, lon, rotate = true) => selectCustomCoordinate(lat, lon, rotate),
    setEpoch,
    goLive: () => { stopSim(); baseEpochMs = null; simOffsetHours = 0; const s = $("time-offset"); if (s) s.value = "0"; updateOffsetLabel(); updateAnalysisUI(); },
    refresh: () => updateAnalysisUI(),
    resizeGlobe: () => window.dispatchEvent(new Event("resize"))
  });

  /* ---------- Boot ---------- */
  window.addEventListener("DOMContentLoaded", () => {
    startClockAndStars();
    initControls();
    initGlobe();
    updateAnalysisUI();
    loadDEM().then(() => updateAnalysisUI());
    fetchLiveNASADialAMoon().then(loadNASASeries);
    setInterval(fetchLiveNASADialAMoon, 10 * 60 * 1000);
  });
})();
