# Real data sources — St. Petersburg, FL

Status of each: **in use now**, **staged** (script written, ready to pull), or
**catalogued** (for when it becomes available). Everything here is free / public.

---

## Terrain / elevation — IN USE

### USGS 3DEP OPR DEM, `FL_Peninsular_2018_D18` (real, high-res patch)
- **What:** bare-earth DEM GeoTIFFs, same 2018 project as the LiDAR collection
  this replaces, 2.5 ft (~0.76 m) native posting, NAD83(2011) / Florida West
  (ftUS) (EPSG:6443), elevation in US survey feet, NAVD88 orthometric.
- **Access:** **required manual download** — the Florida Geographic
  Information Office's LiDAR portal,
  `https://www.floridagio.gov/pages/lidar-resources`. Not fetched at build
  time and not distributed with this repo; each developer downloads the
  tile(s) for their AOI into `DEMs/` at the repo root themselves (gitignored —
  see README "Data"). Same collection is also discoverable via
  `https://tnmaccess.nationalmap.gov/api/v1/products` or
  `https://portal.opentopography.org/usgsDataset?dsid=FL_Peninsular_Pinellas_2018`.
- **In the app:** `web/scripts/bake_dem_terrain.py` mosaics the tiles, reprojects
  to WGS84, converts feet → metres, and writes a ~1536² float32 heightfield patch
  (`web/public/assets/terrain/dem_grid.*`) covering the downtown/waterfront AOI
  (~3 × 3 km). `terrain.ts` blends it into the metro-wide grid below, feathered
  at the patch edges. **Also gitignored** — like the source tiles, this is
  regenerated locally (`npm run bake:dem`), not committed.
- **Vertical caveat:** left in NAVD88 orthometric metres, **not** shifted to WGS84
  ellipsoidal height — the correct shift for this area (≈ −25 m, GEOID18) would
  tear a cliff into the mesh at the patch boundary since the base grid below is
  also unshifted. Replace with a real geoid grid (`pyproj` + GEOID18) in both
  bake scripts together if this ever needs to be geodetically correct.
- **Visible layer:** `web/src/layers/demLayer.ts` draws the same patch as a
  toggleable, elevation-ramp-coloured, lit mesh floating above the terrain (its
  own exaggeration, well beyond the terrain's, purely so the shape reads —
  see the file for the "why" on both).

### AWS `elevation-tiles-prod` terrarium mosaic (stand-in, metro-wide)
- **What:** global elevation raster (USGS 3DEP/NED + SRTM), terrarium-encoded PNG
  XYZ tiles, keyless: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- **In the app:** `web/scripts/bake_terrain.py` samples z13 over the metro
  (bbox −82.80..−82.35, 27.55..28.05) into a 1024² float32 grid served from
  `web/public/assets/terrain/`; `CustomHeightmapTerrainProvider` reads it at
  runtime as the fallback outside the DEM patch above. Effective ~10 m.
- **Note:** production must proxy/cache these tiles (or pre-bake, as we do) to keep
  the "no external services at runtime" property.

### Other DEM sources for later swap-in
- **NOAA Digital Coast Data Access Viewer** — `https://coast.noaa.gov/dataviewer/` —
  coastal topo/topobathy LiDAR, custom AOI + datum + format, incl. post-storm surveys.

---

## LiDAR point cloud — IN USE

### USGS 3DEP LPC, `FL_Peninsular_2018_D18` (real, full-density)
- **What:** discrete-return LiDAR point cloud, same 2018 project and tiles as
  the DEM above, ASPRS-classified (ground / building / vegetation / water / …),
  20-40M points per tile (full density — a `.tif` DEM tile's worth of ground
  covers 100M+ raw points here).
- **Access:** **required manual download**, same portal as the DEM —
  `https://www.floridagio.gov/pages/lidar-resources`. Not fetched at build
  time and not distributed with this repo; each developer downloads the LAZ
  tile(s) for their AOI into `laz/` at the repo root themselves (gitignored —
  see README "Data"). Also discoverable via the public Entwine Point Tiles
  (EPT) index, `https://s3-us-west-2.amazonaws.com/usgs-lidar-public/FL_Peninsular_Pinellas_2018/ept.json`
  (EPSG:3857, whole Pinellas peninsula) — a previous version of this app
  streamed a subset of that instead of using local files; see git history
  (`fetch_lidar.py`) if that approach is ever wanted again (e.g. for AOIs
  outside what's downloaded locally).
- **In the app:** `web/scripts/bake_pointcloud.py` mosaics the DEM tiles
  (native CRS/units, no reprojection needed since the LAZ points share the
  same CRS) and drops any LAZ point whose Z falls below the DEM directly
  beneath it — below-ground blunders (multipath, water-surface noise) that a
  bare-earth DEM has already been cleaned of; ~20% of raw points in this AOI,
  mostly over water. It then reads each tile's point count, decimates (random
  sample) to a fixed ~3M point budget spread proportionally across tiles,
  drops noise classes (7, 18), reprojects X/Y to WGS84 lon/lat, and writes
  **one flat binary file** (`pointcloud.bin`: lon/lat/height/rgb arrays, all
  tiles combined) plus `meta.json` — not 3D Tiles. Output is
  `web/public/assets/pointcloud/`, gitignored — regenerate locally with
  `npm run bake:pointcloud` (requires both `laz/` and `DEMs/` to be
  populated).
- **Vertical caveat:** same as the DEM — feet → metres only, **not** shifted
  to WGS84 ellipsoidal height, so it aligns with the terrain and DEM-surface
  layers instead of floating ~25 m off from them.
- **Visible layer:** `web/src/layers/pointCloudLayer.ts`, a plain point
  `Primitive` with a small custom shader (per-vertex classification colour),
  not a `Cesium3DTileset` — deliberately: Cesium's legacy `.pnts` point-cloud
  renderer (unlike its newer glTF/`Model` pipeline) has no support at all for
  `scene.verticalExaggeration`, and an earlier per-tile transform-matrix
  workaround to fake it could never exactly agree with `demLayer.ts`'s exact
  per-vertex scaling — the two would visibly diverge as the exaggeration
  slider increased. Both layers now build positions through the same shared,
  exact method (`web/src/layers/exaggeration.ts`), so they can't drift apart.
  Trade-off: no 3D Tiles streaming/LOD, no eye-dome-lighting/attenuation
  shading, and a full CPU rebuild (debounced) on every exaggeration change
  instead of a cheap matrix update.

---

## Water level / flood — CATALOGUED (plug in when modeling data arrives)

| Data | Source | Notes |
|---|---|---|
| Observed + predicted tide, datums | NOAA CO-OPS **station 8726520 (St. Petersburg)** — `https://api.tidesandcurrents.noaa.gov/api/prod/` | JSON API, no key; MLLW / NAVD88 datums on the station page |
| Sea-level-rise scenarios | NOAA 2022 Interagency SLR (Low→High), NOAA Sea Level Rise Viewer layers — `https://coast.noaa.gov/slrdata/` | per-scenario inundation depth grids |
| Regulatory flood zones | FEMA National Flood Hazard Layer — `https://hazards.fema.gov/femaportal/wps/portal` / NFHL ArcGIS REST | polygons, GeoJSON-convertible |
| Storm surge | NOAA SLOSH MOMs / MEOWs; USACE | scenario rasters |
| Modeled flood surfaces | **your modeling team** (see IMPLEMENTATION_PLAN.md §4 Data Delivery Spec) | glTF / 3D Tiles / height rasters / CZML, time-tagged |

---

## Buildings — IN USE (estimated)

### Estimated from the LiDAR point cloud, `FL_Peninsular_2018_D18`
- **What:** building footprint polygons, **not a surveyed dataset** —
  estimated by rasterizing where ASPRS class-6 (building) LiDAR returns land,
  cleaning up the raster (morphological close + open), labeling connected
  components as individual buildings, and vectorizing each one. Expect
  rounded corners and occasional merged-together adjacent buildings, not
  parcel-accurate outlines.
- **Access:** derived entirely from the same local `laz/` + `DEMs/` already
  used by `bake_pointcloud.py` / `bake_dem_terrain.py` — no separate download.
- **In the app:** `web/scripts/bake_buildings.py`. Building height = a high
  percentile (P90, to resist noisy outlier returns) of that building's own
  point elevations, minus the DEM (bare-earth) elevation at its footprint
  centroid — both real, unexaggerated orthometric metres, same convention as
  every other real-data layer (see bake_dem_terrain.py's note on why no
  ellipsoid shift). Output is `web/public/assets/buildings/`, gitignored —
  regenerate locally with `npm run bake:buildings` (requires both `laz/` and
  `DEMs/`).
- **Visible layer:** `web/src/layers/buildingsLayer.ts` — extruded
  `PolygonGeometry` per building, coloured by height, tracking the live
  vertical-exaggeration slider via the same shared `exaggeration.ts`
  convention (base and roof both scale by `v * exaggeration`) the DEM
  surface and point cloud use.
- **Swap target:** a surveyed footprint dataset (OSM footprints, or a county
  parcel/building layer), if parcel-accurate outlines are ever needed instead
  of this estimate.

---

## Imagery, sea level — removed

The Phase 0 stand-ins for these (a stylized basemap PNG, a flat translucent
sea-level rectangle) have been removed. Swap targets, if/when reintroduced:

- **Imagery:** **USDA NAIP** (public domain, ~0.6 m, FL) via the National Map,
  tiled locally; or Esri/Sentinel-2 for a quick fill.
- **Sea level:** real tide/SLR data — see the Water level / flood table above.
