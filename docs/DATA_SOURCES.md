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
  at the patch edges. This is the real data that previously showed as a separate
  LiDAR point-cloud layer — it's now baked directly into the terrain mesh instead
  of rendered as points on top of it. **Also gitignored** — like the source
  tiles, this is regenerated locally (`npm run bake:dem`), not committed.
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

### Other LiDAR/DEM sources for later swap-in
- **NOAA Digital Coast Data Access Viewer** — `https://coast.noaa.gov/dataviewer/` —
  coastal topo/topobathy LiDAR, custom AOI + datum + format, incl. post-storm surveys.
- **Full-density LAZ point cloud**, same project — `s3://usgs-lidar` (Requester-Pays,
  EPT at `https://s3-us-west-2.amazonaws.com/usgs-lidar-public/FL_Peninsular_Pinellas_2018/ept.json`)
  — useful again if a true point-cloud view (vegetation structure, non-ground detail)
  is wanted alongside the bare-earth DEM terrain.

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

## Buildings, imagery, sea level — removed

The Phase 0 stand-ins for these (procedural building footprints, a stylized
basemap PNG, a flat translucent sea-level rectangle) have been removed so the
scene is terrain + the real DEM data only. Their swap targets, if/when
they're reintroduced:

- **Buildings:** a DSM−DTM extraction from a future LiDAR DSM, or OSM footprints.
- **Imagery:** **USDA NAIP** (public domain, ~0.6 m, FL) via the National Map,
  tiled locally; or Esri/Sentinel-2 for a quick fill.
- **Sea level:** real tide/SLR data — see the Water level / flood table above.
