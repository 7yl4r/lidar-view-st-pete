# lidar-viewer

Browser-based 3D scene player for **St. Petersburg, FL** LiDAR / sea-level
modeling data, built on **CesiumJS**. The app streams self-hosted geospatial
tiles and renders modeling outputs (water surfaces, hazard extents, annotations)
produced by a separate data pipeline.

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the full plan and
phasing.

## Status: Phase 0 complete

A navigable 3D city with **stand-in data** and **no external services**:

- Self-hosted CesiumJS engine assets (via `vite-plugin-cesium`)
- Flat (ellipsoid) terrain — placeholder for self-hosted quantized-mesh
- Stylized "aerial" basemap for the city extent + global ocean fallback (generated PNGs)
- ~2,900 procedural extruded building footprints, batched into one primitive
- A translucent stand-in sea surface over Tampa Bay / the gulf side
- Presentation atmosphere: ground atmosphere, fog, HDR, soft shadows, bloom, FXAA
- UI shell: camera bookmarks, layer toggles, quality preset, FPS / altitude / lat-lon HUD

Everything marked "stand-in" is a placeholder; real tiles/meshes drop into the
same `public/assets/**` paths and `SceneController` swap points (each layer
module documents its replacement call).

HDR tone-mapping is **off** in the "Workstation" quality preset and **on** in
"Viz-Center" (and only where `scene.highDynamicRangeSupported`) — some drivers
render a black frame with an HDR float buffer, which is unacceptable on a wall.

`docs/phase0-*.jpg` are reference captures of the running Phase 0 build.

## Prerequisites

- **Node 20+** (`.nvmrc` pins 20). `nvm use`
- **Python 3** with `pillow` + `numpy` — only to regenerate stand-in assets

## Quick start

```bash
cd web
npm install
npm run gen:standins   # (re)generate placeholder assets into public/assets
npm run dev            # http://localhost:5173
```

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
  scripts/gen_standins.py     stand-in asset generator (PNG basemap, buildings GeoJSON)
  public/assets/              generated placeholder data (git-ignored? no — committed for demo)
  src/
    engine/                   Viewer creation, atmosphere, camera, SceneController facade
    layers/                   terrain / imagery / buildings / water  (+ swap-path notes)
    scene/sceneConfig.ts      bookmarks, layer list, quality presets  (Phase 1: scene.json)
    state/store.ts            Zustand store; UI <-> SceneController glue
    ui/                       control panel, HUD, title overlay
IMPLEMENTATION_PLAN.md        overall plan
.github/workflows/ci.yml      lint + typecheck + test + build
```
