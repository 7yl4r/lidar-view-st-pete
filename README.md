# lidar-viewer

Browser-based 3D scene player for **St. Petersburg, FL** LiDAR / sea-level
modeling data, built on **CesiumJS**. The app streams self-hosted geospatial
tiles and renders modeling outputs (water surfaces, hazard extents, annotations)
produced by a separate data pipeline.

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the full plan and
phasing.

## Status

Navigable 3D scene, **self-hosted**, no external services at runtime.

**Real data now** (see [`docs/DATA_SOURCES.md`](./docs/DATA_SOURCES.md)):

- **LiDAR point cloud** — USGS 3DEP `FL_Peninsular_Pinellas_2018` (~0.35 m pulse
  spacing), a ~2 M-point downtown/waterfront subset converted to self-hosted
  3D Tiles, coloured by ASPRS classification (`scripts/fetch_lidar.py`).
  This is also the source of building shapes — there is no footprint dataset.
- **Terrain** — real elevation baked from the USGS 3DEP/NED-derived terrarium
  mosaic (`scripts/bake_terrain.py`), served as a heightfield grid and read by
  `CustomHeightmapTerrainProvider`. Deliberately ~10 m; a stand-in for a
  LiDAR-derived DTM tileset.
- **Vertical exaggeration** slider (1–12×, default 3×) — St. Petersburg is very
  flat.

**Still stand-in:** aerial basemap PNG + ocean fallback; procedural building
footprints (fallback, off by default, clipped to land); flat translucent sea
surface. Water-level / flood modeling data plugs in later.

- Self-hosted CesiumJS engine assets (via `vite-plugin-cesium`); Ion token blanked
- Presentation atmosphere: ground atmosphere, fog, soft shadows, bloom, FXAA
- UI shell: camera bookmarks, layer toggles, quality preset, exaggeration slider,
  FPS / altitude / lat-lon HUD

Real tiles/meshes drop into the same `public/assets/**` paths; each layer module
documents its swap point.

HDR tone-mapping is **off** in the "Workstation" quality preset and **on** in
"Viz-Center" (and only where `scene.highDynamicRangeSupported`) — some drivers
render a black frame with an HDR float buffer, which is unacceptable on a wall.

`docs/phase0-*.jpg` are reference captures of the running Phase 0 build.

## Prerequisites

- **Node 20+** (`.nvmrc` pins 20). `nvm use`
- **Python 3** — to (re)generate data assets:
  `pip install "laspy[lazrs]" pyproj numpy pillow`

## Quick start

```bash
cd web
npm install
npm run gen:standins    # stand-in basemap + fallback buildings  -> public/assets
npm run bake:terrain    # real elevation grid (downloads terrarium tiles once)
npm run fetch:lidar      # real USGS 3DEP point cloud -> 3D Tiles (~3-5 min, ~30 MB)
npm run dev             # http://localhost:5173
```

The generated `public/assets/**` are committed, so the three data scripts are
only needed to refresh or re-scope them.

Other scripts:

```bash
npm run build       # tsc --noEmit + vite build  ->  web/dist
npm run preview     # serve the production build
npm run lint
npm run typecheck
npm test            # vitest (unit tests for config + utils)
```

## Layout

```
web/
  scripts/
    gen_standins.py     stand-in basemap PNG + fallback building footprints
    bake_terrain.py     real elevation -> heightfield grid
    fetch_lidar.py      real USGS 3DEP EPT subset -> 3D Tiles point cloud
  public/assets/        committed data (basemap/, terrain/, pointcloud/, buildings/)
  src/
    engine/             Viewer creation, atmosphere, camera, SceneController facade
    layers/             terrain / imagery / pointCloud / buildings / water (+ swap notes)
    scene/sceneConfig.ts  bookmarks, layers, quality, terrain, exaggeration, pointcloud
    state/store.ts      Zustand store; UI <-> SceneController glue
    ui/                 control panel, HUD, title overlay
docs/DATA_SOURCES.md    real data catalogue (in use / staged / for later)
IMPLEMENTATION_PLAN.md  overall plan
.github/workflows/ci.yml   lint + typecheck + test + build
```
