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

## Quick start

```bash
cd web
npm install
npm run bake:terrain    # metro-wide elevation grid (downloads terrarium tiles once)
npm run bake:dem        # real high-res elevation patch from DEMs/*.tif -> public/assets
npm run dev             # http://localhost:5173
```

The generated `public/assets/**` are committed, so the two data scripts are
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
    bake_terrain.py     metro-wide elevation -> heightfield grid (stand-in)
    bake_dem_terrain.py real elevation from ../DEMs/*.tif -> heightfield patch
  public/assets/        committed data (terrain/)
  src/
    engine/             Viewer creation, atmosphere, camera, SceneController facade
    layers/             terrain (heightfield) / demLayer (visible DEM surface)
    scene/sceneConfig.ts  bookmarks, layers, quality, terrain, exaggeration
    state/store.ts      Zustand store; UI <-> SceneController glue
    ui/                 control panel, HUD, title overlay
DEMs/                   source USGS DEM GeoTIFFs consumed by bake_dem_terrain.py
docs/DATA_SOURCES.md    real data catalogue (in use / staged / for later)
IMPLEMENTATION_PLAN.md  overall plan
.github/workflows/ci.yml   lint + typecheck + test + build
```
