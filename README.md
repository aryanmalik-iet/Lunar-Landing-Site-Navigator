# SELENE // OPS — Lunar Landing Site Navigator & Ephemeris Window Planner

An interactive 3D lunar landing feasibility and mission window planner built for the **NASA International Space Apps Challenge** (100% keyless).

## Features

- **Interactive 3D Moon Globe (Three.js)**:
  - Textured with real **NASA LRO Wide Angle Camera (WAC)** global color mosaic (`assets/lroc_color_2k.jpg`) and **LOLA** laser altimetry bump map (`assets/ldem_3_8bit.jpg`) from the NASA GSFC SVS CGI Moon Kit (#4720).
  - Real-time directional solar illumination driven by NASA's live subsolar coordinates.
- **3D Lunar Region Explorer & Boundary Highlighter**:
  - Select from 21 major lunar provinces (Maria, Oceanus, Polar Artemis zones, Far-side basins, and Highland massifs) to highlight their spherical footprint and concentric boundary rings on the 3D globe before dropping a pin.
- **Custom Coordinate Pin Dropper & Current Missions Overlay**:
  - Enter any selenographic latitude (`-90°..+90°` or `N/S`) and longitude (`-180°..+180°` or `E/W`) or click anywhere on the 3D Moon.
  - Highlights active/current-era lunar missions (`Blue Ghost M1`, `IM-2 Athena`, `Chang'e-6`, `IM-1 Odysseus`, `SLIM`, `Chandrayaan-3`, `Chang'e-4`) alongside planned Artemis candidate regions and historic Apollo/Luna heritage sites.
- **Calibrated Landing Feasibility & Ephemeris Window Calculator**:
  - **Solar Geometry & Ephemeris**: Live **NASA GSFC SVS Dial-A-Moon API** (`JPL DE440`) paired with a calibrated **Jean Meeus Ch. 47 & Ch. 53** analytical selenographic ephemeris (`< 0.02°` subsolar accuracy).
  - Distinguishes **Lunar Morning (rising Sun)** from **Lunar Afternoon (setting Sun)** to compute exact touchdown windows (`5°–28°` rising Sun at low/mid latitudes; `1.5°–16°` near the poles), remaining daylight today, and full sunlit surface stay durations (`~14.7 Earth days`).
  - **Topographic Relief**: Queries pre-encoded **NASA LRO LOLA** 4 px/deg digital elevation and regional slope data (`assets/lola_4ppd_elev_slope.png`).
  - **Direct-to-Earth (DTE) Communications**: Computes topocentric Earth elevation including optical and physical libration to determine Direct LOS vs. Lunar Relay Satellite requirement.

## Quick Start

Run the included zero-dependency Python server (which serves the static app and proxies `/api/dialamoon/<timestamp>` to `https://svs.gsfc.nasa.gov/api/dialamoon/` to avoid browser CORS restrictions):

```bash
python server.py 5500
```

Then open **http://127.0.0.1:5500** in your browser.
