# St. Petersburg, FL — LiDAR / Modeling-Data Visualization
## Implementation Plan (v2 — revised per your answers)

**Date:** 2026-09-10
**Status:** Proposal for review — no code written yet

### What changed from v1

Per your direction:

1. **Free assets only** — no Google Photorealistic 3D Tiles. Base map is built from
   public-domain / open data.
2. **Self-host everything, minimize external services** — no runtime dependency on
   Cesium ion or any third-party tile service. We run our own tile stack.
3. **CesiumJS only** — dropped deck.gl and the Unreal / Pixel Streaming path. All
   rendering and markup use native CesiumJS.
4. **This is a display, not an analysis tool** — the app does **not** compute floods,
   measurements, or cross-sections. It *ingests modeling data produced elsewhere* and
   presents it with 3D interactivity, a synchronized timeline, and scenario switching.
5. **Deploy target undefined, budget large** — we build it properly: containerized,
   self-hosted, scalable, and tuned for a high-performance visualization center
   (4K / multi-display / strong GPU).

### Your reference video

*"Visualizing Rocket Telemetry and Cityscapes with Cesium and Three.js"* (Cesium, Jul 2025)
— its polish comes from atmospheric effects, volumetric clouds, and post-processing over
3D Tiles. That demo mixed in Three.js **only** for the volumetric clouds; the rest
(ground atmosphere, fog, HDR, bloom, sun/lighting, custom post-process stages) is native
CesiumJS. We target that look with CesiumJS alone and revisit clouds later if wanted.

---

## 1. Core Concept

> **A CesiumJS-based scene player.** External modeling pipelines produce time-varying
> geospatial datasets — water surfaces, flood extents, scalar fields, annotated markers
> and text. The app loads a **scene manifest**, streams the referenced **self-hosted**
> tiles and assets, and provides 3D navigation, a synchronized timeline, and scenario
> switching for presentation on large displays.

The two contracts that make this work:

- **Data Delivery Spec** — the documented set of formats/CRS/naming the modeling team
  targets when they hand us outputs. Drop conforming files on the tile server, update the
  manifest, and they appear in the app. No code changes for new data.
- **Scene Manifest (`scene.json`)** — declares base layers, model-output layers, the
  clock (start / stop / step), the list of scenarios, camera bookmarks, legends, and
  tour sequences.

---

## 2. Rendering Stack

| Concern | Choice | Notes |
|---|---|---|
| 3D engine | **CesiumJS** (Apache-2.0, self-hosted build) | Globe, camera, streaming 3D Tiles, time-dynamic CZML, entities, styling |
| App shell | React 18 + TypeScript 5 + Vite 5 | `vite-plugin-cesium`; Node 20 LTS (env currently has 16 — upgrade needed) |
| State | Zustand | Camera / clock / layer / scenario state; URL sync for shareable views |
| UI | Radix UI or shadcn/ui + Tailwind | Layer panel, timeline, scenario picker, legends |
| Panel charts (time-series readouts only) | uPlot | Just displays numbers the modeling team supplies — not analysis |
| Markup | CZML, `Entity` API, `Cesium3DTileStyle`, `PostProcessStage` | Labels, billboards, polylines, extruded polygons, callouts, color ramps |

No deck.gl. No game engine. No external SaaS at runtime.

---

## 3. Self-Hosted Tile & Asset Stack

Everything the browser loads comes from **our** infrastructure. Generation is offline
(containerized Python/GDAL/PDAL); serving is mostly static files behind a CDN.

| Layer | Source data (free) | Build tool | Served as |
|---|---|---|---|
| **Terrain** | USGS 3DEP 1 m DEM (Pinellas Co.); SRTM/global as fallback | `cesium-terrain-builder` (CTB) in Docker | Quantized-mesh tiles, static |
| **Imagery** | USDA **NAIP** aerial (public domain, ~0.6 m, FL); Sentinel-2 cloudless as backup | `gdal2tiles` / `rio-mbtiles` | XYZ/WMTS raster tiles, static (or `mbtiles` + tiny server) |
| **Buildings** | OpenStreetMap footprints + `height`/`building:levels` | OSM → PostGIS → `py3dtiles` / `pg2b3dm` | 3D Tiles (`b3dm`), static. Swap in LiDAR-derived meshes later |
| **LiDAR point cloud** | USGS **3DEP** (public `s3://usgs-lidar-public` EPT, or full-density LAZ) | PDAL (reproject + classify + denoise) → `py3dtiles` | 3D Tiles (`pnts`), static |
| **Model outputs** | Produced by your modeling team (see §4) | Their pipeline, to our spec | 3D Tiles / glTF / CZML / GeoJSON, on our server |

**Serving:** Nginx for static tiles + app; optional [TiTiler](https://developmentseed.org/titiler/)
container if we want dynamic raster colormapping of scalar fields; object storage
(MinIO / S3-compatible) + CDN in front. All defined in Docker Compose now, portable to
Kubernetes for the viz-center install.

**Dev bootstrapping note:** we *may* use a free Cesium ion account during early
development for convenience, but Phase 0 stands up the self-hosted terrain+imagery+buildings
so there is never a runtime dependency on it.

---

## 4. Data Delivery Spec (draft — for the modeling team)

The app renders these categories. Each is referenced from `scene.json` with a CRS,
time binding, and style.

| Category | Preferred format | Time model | Example |
|---|---|---|---|
| **Water / flood surfaces** | glTF/`.glb` mesh **or** 3D Tiles; or a heightfield raster we mesh | Per-timestep file list, or CZML with `availability`; or a single mesh whose height is animated | SLR surface at 10-year steps 2030–2100 |
| **Flood / hazard extents** | GeoJSON polygons (WGS84), or vector tiles for big sets | Time-tagged features, or per-step files | Inundation boundary per scenario |
| **Scalar fields** (depth, salinity, velocity…) | Georeferenced raster (COG) + named colormap; or 3D Tiles with per-feature metadata | Per-step COGs, or metadata + `Cesium3DTileStyle` | Water-depth grid |
| **Markers / annotations / text** | **CZML** (preferred — native, time-dynamic) or GeoJSON+style | CZML `availability` / interpolated positions | Sensor callouts, model labels, notes |
| **Time-series readouts** | Plain JSON `{t, value}[]` per station | Aligned to the scene clock | Gauge level vs. time in the side panel |
| **Vertical reference** | Everything delivered in, or convertible to, **WGS84 ellipsoidal height** | — | See §6 |

Deliverables from us: a written spec doc + JSON Schema for `scene.json` + a validator CLI
+ conforming **placeholder datasets** (synthetic SLR surfaces, fake annotations) so the
app is fully demoable before real data exists.

---

## 5. Application Features (display-focused)

- **3D navigation** — free camera, named **bookmarks** ("The Pier", "Downtown Waterfront",
  "Shore Acres"), smooth `flyTo`.
- **Synchronized timeline** — scrub / play / pause / speed; one Cesium clock drives every
  time-dynamic layer.
- **Scenario switcher** — swaps the active set of model-output layers (e.g. *SLR +1 ft
  2050*, *SLR +3 ft 2100*, *Cat-3 surge*); crossfade between them.
- **Layer panel** — visibility, opacity, legend + color ramp per layer.
- **Guided tours / attract mode** — scripted camera + time sequences (CZML or a small
  tour format); auto-plays when idle for kiosk use.
- **Presentation polish** — ground atmosphere, fog, HDR, bloom, sun/shadow, tuned
  post-processing to hit the reference look.
- **Big-screen / kiosk mode** — 4K & ultrawide layouts, hidden cursor, idle reset,
  on-screen title/legend overlays sized for viewing distance.
- **Capture** — high-res screenshot; optional client-side frame recording for fly-throughs.
- **Shareable state** — camera + time + scenario + layers encoded in the URL.
- *(Optional, Phase 6)* **Display-wall sync** — multiple browser nodes locked to one
  master camera/clock over WebSocket for a multi-projector video wall.

Explicitly **not** in scope: measurement tools, cross-sections, client-side flood
computation, data editing. The modeling happens elsewhere.

---

## 6. Coordinate System & Vertical Datum (still critical)

Even as a pure display, wrong vertical registration makes water sit through rooftops.

- USGS 3DEP LiDAR/DEM for Florida: **NAD83 State Plane, NAVD88 orthometric heights**.
- CesiumJS renders in **WGS84 ellipsoidal (ECEF)**; NAVD88 → ellipsoid is ≈ −25 m here
  and requires a **geoid model (GEOID18)**.
- The tiling pipeline bakes the reprojection + geoid shift so terrain, buildings, and
  point clouds share one frame.
- The Data Delivery Spec requires model outputs in the same frame (or gives the team a
  transform recipe + validator). `scene.json` records each layer's source datum.

---

## 7. Phased Implementation

Each phase ends with a running, hosted build.

### Phase 0 — Scaffold + self-hosted base map (est. 3–5 days)
- Repo, Vite + React + TS + self-hosted CesiumJS, CI (lint/test/build), Dockerized tile
  generation + Nginx serving.
- Self-hosted **terrain** (3DEP DEM → CTB), **imagery** (NAIP → tiles), **OSM buildings**
  (→ 3D Tiles) for the St. Petersburg extent.
- Camera locked to the city with bookmarks; atmosphere/lighting baseline.
- **Deliverable:** navigable 3D St. Petersburg, zero external services.

### Phase 1 — Scene manifest + layer system + UI shell (est. 4–5 days)
- `scene.json` schema + loader + validator CLI.
- Layer panel (visibility/opacity/legend), bookmarks, stats HUD (FPS, tile memory),
  quality presets (Workstation / Viz-Center), URL state sync.
- **Deliverable:** data-driven scene; add a layer by editing JSON.

### Phase 2 — Timeline + scenario playback (est. 4–5 days)
- Cesium clock UI (scrub/play/speed), scenario switcher with crossfade.
- CZML ingestion path; per-timestep file-list ingestion path.
- **Deliverable:** load a time-varying CZML + switch scenarios, all synchronized.

### Phase 3 — Model-output ingestion + placeholder data (est. 5–7 days)
- Loaders: water-surface mesh/3D Tiles, flood-extent GeoJSON (time-tagged), scalar raster
  (COG + colormap), CZML markup, time-series JSON → side panel.
- Publish the **Data Delivery Spec** doc + JSON Schema + validator.
- Build conforming **placeholder datasets** (synthetic SLR surfaces 2030–2100, fake
  sensor annotations, a depth raster).
- **Deliverable:** end-to-end demo with placeholder "modeling data".

### Phase 4 — LiDAR point cloud layer (est. 4–6 days)
- PDAL → 3D Tiles pipeline for a St. Pete subset (downtown + waterfront), self-hosted.
- Styling: elevation ramp, classification, intensity; point size / EDL controls; toggle
  vs. the building layer.
- **Deliverable:** streaming city-scale point cloud.

### Phase 5 — Presentation & big-screen hardening (est. 4–6 days)
- 3D Tiles tuning (`maximumScreenSpaceError`, cache, `requestRenderMode`), resolution
  scaling, MSAA/FXAA, HDR/bloom tuning to the reference look.
- 4K / ultrawide / kiosk mode, idle attract tour, large-format overlays.
- Load test on a representative GPU; document tuned presets.
- **Deliverable:** viz-center-ready build.

### Phase 6 — Optional extras (scope later)
- Display-wall multi-node camera/clock sync (WebSocket master/follower).
- Live data feed hook (if any model output becomes streaming rather than batch).
- Volumetric clouds / advanced sky if native atmosphere isn't "good enough".

**Rough total, Phases 0–5: ~5–7 weeks** for one experienced graphics/full-stack dev;
Phases 2–4 partly parallelizable with a second dev. Infra work (Docker/K8s, CDN) overlaps
Phases 0–1.

---

## 8. Infrastructure (self-hosted, budget-comfortable)

```
                       ┌─────────────── CDN ───────────────┐
  Browser (kiosk Chrome │  cache: terrain / imagery /       │
  on viz-center GPU) ───┤  3D Tiles / glTF / GeoJSON        │
                        └──────────────┬───────────────────┘
                                       │
        ┌──────────────────────────────┼───────────────────────────┐
        ▼                              ▼                           ▼
  Nginx (static)              MinIO / S3-compatible          TiTiler (optional)
  - web app bundle            object store                   - dynamic colormap
  - tile trees                - all generated tiles            of scalar COGs
  - scene.json                - model-output drop zone
                                       ▲
                        ┌──────────────┴───────────────┐
                        │  Offline generation (Docker) │
                        │  GDAL · CTB · PDAL · py3dtiles│
                        │  OSM→PostGIS→3D Tiles         │
                        └──────────────────────────────┘

  CI/CD: build web app + validator; rebuild base tiles on source change.
  All services in Docker Compose now → Helm/K8s for the viz-center install.
```

---

## 9. Repo Structure

```
lidar-viewer/
├── web/                       # React + self-hosted CesiumJS app
│   ├── src/
│   │   ├── engine/            # Cesium viewer setup, camera, clock, post-processing
│   │   ├── scene/             # scene.json schema, loader, validator
│   │   ├── layers/            # loaders: terrain, imagery, buildings, pointcloud,
│   │   │                      #          water-surface, flood-extent, scalar, czml
│   │   ├── playback/          # timeline UI, scenario switching, tours
│   │   ├── ui/                # panels, legends, HUD, kiosk overlays
│   │   └── state/             # Zustand store + URL sync
│   └── public/scene/scene.json
├── pipeline/                  # Dockerized offline tile generation
│   ├── terrain/               # DEM → quantized-mesh (CTB)
│   ├── imagery/               # NAIP → raster tiles
│   ├── buildings/             # OSM → 3D Tiles
│   └── pointcloud/            # 3DEP LAZ → 3D Tiles (PDAL + py3dtiles)
├── spec/                      # Data Delivery Spec doc + JSON Schema + validator CLI
├── placeholder-data/          # synthetic model outputs conforming to the spec
├── infra/                     # docker-compose, nginx, CDN, (later) helm charts
└── docs/
```

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Vertical datum errors (water through rooftops) | Bake GEOID18 in pipeline; spec requires WGS84 ellipsoidal; validator checks it |
| Modeling-team outputs arrive in unexpected formats | Publish spec + JSON Schema + validator early (Phase 3); provide a transform recipe |
| Raw LAZ too heavy for browser | Always tile server-side (3D Tiles / EPT); stream by view |
| Native atmosphere not matching the reference "look" | Phase 5 post-processing budget; volumetric clouds deferred to Phase 6 |
| Node 16 in current environment | Upgrade to Node 20 LTS before scaffolding |
| Undefined deploy target | Keep everything containerized + config-driven; presets, not hard-coded hardware assumptions |
| Self-hosted tiles = ops load | Static-file-first design; Compose now, K8s later; CDN caching |

---

## 11. Immediate Next Steps (on approval)

1. Upgrade Node; scaffold `web/` with a self-hosted CesiumJS build.
2. Stand up the Dockerized pipeline; generate St. Petersburg terrain + NAIP imagery +
   OSM building 3D Tiles.
3. Get the city rendering with bookmarks and baseline atmosphere (Phase 0).
4. Draft `scene.json` schema + the Data Delivery Spec skeleton.
5. Wire CI + a hosted preview URL.

---

## Sources

- [Visualizing Rocket Telemetry and Cityscapes with Cesium and Three.js — Cesium (YouTube)](https://www.youtube.com/watch?v=UTk5tE7vw_o)
- [CesiumJS — Cesium](https://cesium.com/platform/cesiumjs/)
- [3D Tiles — Cesium](https://cesium.com/why-cesium/3d-tiles/)
- [Point Clouds tiling — Cesium](https://cesium.com/platform/cesium-ion/3d-tiling-pipeline/point-clouds/)
- [USGS 3DEP LiDAR Point Clouds — Registry of Open Data on AWS](https://registry.opendata.aws/usgs-lidar/)
- [USGS & Entwine (EPT resources)](https://usgs.entwine.io/)
- [USGS 3DEP LiDAR Point Cloud as Amazon Public Dataset — USGS](https://www.usgs.gov/news/technical-announcement/usgs-3dep-lidar-point-cloud-now-available-amazon-public-dataset)
- [cesium-terrain-builder — GitHub](https://github.com/geo-data/cesium-terrain-builder)
- [py3dtiles — documentation](https://py3dtiles.org/)
- [USDA NAIP imagery — USGS EarthExplorer / Registry of Open Data on AWS](https://registry.opendata.aws/naip/)
- [NOAA Tides & Currents — station 8726520, St. Petersburg FL](https://tidesandcurrents.noaa.gov/inventory.html?id=8726520)
- [TiTiler — Development Seed](https://developmentseed.org/titiler/)
