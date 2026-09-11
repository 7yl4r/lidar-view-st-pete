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

- **Terrain** — a metro-wide stand-in heightfield baked from the USGS 3DEP/NED-derived
  terrarium mosaic (`scripts/bake_terrain.py`, ~10 m effective), with a real
  high-resolution patch blended in over the downtown/waterfront AOI, baked from local
  USGS 3DEP OPR DEM GeoTIFFs (`DEMs/*.tif`, 2.5 ft posting) by
  `scripts/bake_dem_terrain.py`. Both are served as heightfield grids read by
  `CustomHeightmapTerrainProvider`.
- **Vertical exaggeration** slider (1–12×, default 3×) — St. Petersburg is very
  flat.

**Still stand-in:** the metro-wide terrain outside the DEM patch. No basemap
imagery, buildings, or sea-level layer are currently rendered — the scene is
terrain + the DEM surface layer only. Water-level / flood modeling data plugs
in later.

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
  `pip install numpy pillow rasterio`

## Data

The real terrain patch is built from Florida statewide LiDAR-derived DEM
GeoTIFFs — **not included in this repo**. Download the DEM tiles covering
your area of interest from the Florida Geographic Information Office:

> https://www.floridagio.gov/pages/lidar-resources

Drop the downloaded `.tif` tile(s) into a `DEMs/` folder at the repo root
(create it if it doesn't exist), then bake them (below). `DEMs/` and its baked
output (`web/public/assets/terrain/dem_grid.*`) are both gitignored — nobody
commits raw or processed LiDAR data here; each developer sources and
processes their own copy.

## Quick start

```bash
cd web
npm install
npm run bake:terrain    # metro-wide elevation grid (downloads terrarium tiles once)
npm run bake:dem        # process ../DEMs/*.tif -> real high-res elevation patch
npm run dev             # http://localhost:5173
```

`bake:dem` requires `DEMs/` to be populated first (see **Data** above) and
will error out otherwise. `web/public/assets/terrain/grid.bin` (the metro-wide
stand-in) is the one generated asset that *is* committed; everything derived
from the DEMs is regenerated locally by each developer, never committed.

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
    bake_terrain.py     metro-wide elevation -> heightfield grid (stand-in, committed)
    bake_dem_terrain.py real elevation from ../DEMs/*.tif -> heightfield patch (gitignored)
  public/assets/
    terrain/grid.bin, grid.json          committed (metro-wide stand-in)
    terrain/dem_grid.bin, dem_grid.json  gitignored (baked from DEMs/ locally)
  src/
    engine/             Viewer creation, atmosphere, camera, SceneController facade
    layers/             terrain (heightfield) / demLayer (visible DEM surface)
    scene/sceneConfig.ts  bookmarks, layers, quality, terrain, exaggeration
    state/store.ts      Zustand store; UI <-> SceneController glue
    ui/                 control panel, HUD, title overlay
DEMs/                   gitignored -- source DEM GeoTIFFs, see "Data" above
docs/DATA_SOURCES.md    real data catalogue (in use / staged / for later)
IMPLEMENTATION_PLAN.md  overall plan
.github/workflows/ci.yml   lint + typecheck + test + build
```
