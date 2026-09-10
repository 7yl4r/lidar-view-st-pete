# Real data sources — St. Petersburg, FL

Status of each: **in use now**, **staged** (script written, ready to pull), or
**catalogued** (for when it becomes available). Everything here is free / public.

---

## LiDAR — IN USE

### USGS 3DEP `FL_Peninsular_Pinellas_2018`
- **What:** airborne LiDAR point cloud, whole Pinellas peninsula, ~0.35 m nominal
  pulse spacing, ASPRS-classified (ground / building / vegetation / water / …).
- **Access (used):** public Entwine Point Tiles (EPT), no key:
  `https://s3-us-west-2.amazonaws.com/usgs-lidar-public/FL_Peninsular_Pinellas_2018/ept.json`
  (16.8 B points total; CRS EPSG:3857; Z = NAVD88 orthometric metres).
- **In the app:** `web/scripts/fetch_lidar.py` walks the octree for a ~2.9 × 2.4 km
  downtown/waterfront AOI, subsamples to ~2 M points, and writes a self-hosted
  3D Tiles point cloud (`web/public/assets/pointcloud/`) coloured by classification.
- **Full-density LAZ tiles:** `s3://usgs-lidar` (Requester-Pays) or the National Map.
- **Vertical caveat:** the app applies a **constant −25.5 m** shift (approx GEOID18
  for this area) to move NAVD88 → WGS84 ellipsoid. Replace with a real geoid grid
  (`pyproj` + GEOID18, or PDAL `filters.reprojection`) in the data pipeline.

### Other LiDAR for later swap-in
- **USGS 1 m DEM (bare earth), same 2018 project** — direct GeoTIFF, no key,
  e.g. `https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/FL_Peninsular_2018_D18/TIFF/USGS_1M_17_x33y307_FL_Peninsular_2018_D18.tif`
  (discover tiles via `https://tnmaccess.nationalmap.gov/api/v1/products`).
- **NOAA Digital Coast Data Access Viewer** — `https://coast.noaa.gov/dataviewer/` —
  coastal topo/topobathy LiDAR, custom AOI + datum + format, incl. post-storm surveys.
- **OpenTopography** — `https://portal.opentopography.org/usgsDataset?dsid=FL_Peninsular_Pinellas_2018`
  — subset / grid / DEM-generate the same 3DEP collection (API key for raster jobs).

---

## Terrain / elevation — IN USE (low-res stand-in)

### AWS `elevation-tiles-prod` terrarium mosaic
- **What:** global elevation raster (USGS 3DEP/NED + SRTM), terrarium-encoded PNG
  XYZ tiles, keyless: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- **In the app:** `web/scripts/bake_terrain.py` samples z13 over the metro
  (bbox −82.80..−82.35, 27.55..28.05) into a 1024² float32 grid served from
  `web/public/assets/terrain/`; `CustomHeightmapTerrainProvider` reads it at runtime.
  Effective ~10 m — a deliberate placeholder for a LiDAR-derived DTM.
- **Why not the 1 m DEM yet:** needs quantized-mesh tiling (CTB / a real pipeline);
  the terrarium path gives real relief now with zero pipeline. Swap target:
  self-hosted quantized-mesh at `/assets/terrain/` from `USGS_1M_..._D18.tif`.
- **Note:** production must proxy/cache these tiles (or pre-bake, as we do) to keep
  the "no external services at runtime" property.

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

## Buildings — NOT a separate dataset

No building-footprint source is planned. Building shapes come from the **LiDAR**
(classification 6 in the point cloud now; a LiDAR DSM or a DSM−DTM extraction
later). The procedural `stand-in` buildings in the app are a fallback, off by
default, clipped to land.

---

## Imagery — stand-in

Stylized generated basemap for the city extent (`web/scripts/gen_standins.py`).
Real swap: **USDA NAIP** (public domain, ~0.6 m, FL) via the National Map, tiled
locally; or Esri/Sentinel-2 for a quick fill.
