#!/usr/bin/env python3
"""
Estimate building footprint polygons from the classified LiDAR point cloud.

Source: local full-density LAZ tiles in `../../laz/` at the repo root, same
as bake_pointcloud.py -- specifically the points the original 2018 survey
classified as ASPRS class 6 (building). This is estimation, not a surveyed
footprint dataset: we rasterize where building-classified returns land,
clean up the raster, and vectorize the resulting blobs. Expect rounded
corners and merged-together adjacent buildings, not parcel-accurate outlines.

What this does
--------------
- reads class-6 (building) points from all tiles, natively in state-plane
  feet (matching the DEM's CRS, EPSG:6443 -- see bake_dem_terrain.py)
- rasterizes their X/Y onto a 1 m grid (occupied / empty), then closes small
  gaps (binary_closing) and drops speckle noise (binary_opening) -- LiDAR
  building returns are a scatter of individual points, not a solid mask, so
  this step is what turns "points landed here" into "there's a building here"
- labels connected components (scipy.ndimage.label) as individual buildings,
  drops tiny ones (< MIN_AREA_M2, likely noise/misclassification)
- vectorizes each building's mask to a polygon (rasterio.features.shapes),
  simplifies it (shapely, Douglas-Peucker) to remove raster-grid jaggies
- estimates each building's height: roof = a high percentile (not the max,
  to resist noise) of that building's own point elevations; base = the DEM
  (bare-earth) elevation at the building's centroid. Both are real
  (unexaggerated) orthometric metres, matching every other real-data layer
  in this app (see bake_dem_terrain.py's note on why no ellipsoid shift)
- writes one GeoJSON FeatureCollection (Polygon per building, `height` +
  `baseHeight` properties, both metres) -- consumed by buildingsLayer.ts

Run:  python3 scripts/bake_buildings.py
Deps: laspy[lazrs], pyproj, rasterio, shapely, scipy, numpy
      (pip install "laspy[lazrs]" pyproj rasterio shapely scipy numpy)
"""
from __future__ import annotations

import json
from pathlib import Path

import laspy
import numpy as np
import rasterio
from affine import Affine
from pyproj import Transformer
from rasterio.features import shapes as raster_shapes
from rasterio.merge import merge as merge_rasters
from scipy import ndimage
from shapely.geometry import shape as shapely_shape

LAZ_DIR = Path(__file__).resolve().parents[2] / "laz"
DEM_DIR = Path(__file__).resolve().parents[2] / "DEMs"
OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "buildings"

SRC_CRS = 6443  # NAD83(2011) / Florida West (ftUS) -- matches the DEM tiles
BUILDING_CLASS = 6
FT_TO_M = 0.3048006096012192  # US survey foot

GRID_RES_M = 1.0            # rasterization cell size
CLOSING_ITER = 2            # fills gaps between sparse building returns
OPENING_ITER = 1            # removes single/few-pixel speckle
MIN_AREA_M2 = 20.0           # drop blobs smaller than this (likely noise)
SIMPLIFY_TOLERANCE_M = 1.0   # Douglas-Peucker tolerance on the vectorized outline
ROOF_PERCENTILE = 90         # resists a handful of noisy high outlier returns

_to_lonlat = Transformer.from_crs(SRC_CRS, 4326, always_xy=True)


def load_dem_mosaic() -> tuple[np.ndarray, Affine, float]:
    tif_paths = sorted(DEM_DIR.glob("*.tif"))
    if not tif_paths:
        raise SystemExit(f"no .tif files found in {DEM_DIR}")
    srcs = [rasterio.open(p) for p in tif_paths]
    nodata = srcs[0].nodata
    band, transform = merge_rasters(srcs, nodata=nodata)
    for s in srcs:
        s.close()
    return band[0], transform, nodata


def sample_dem(band: np.ndarray, inv_transform: Affine, nodata: float,
                x: np.ndarray, y: np.ndarray) -> np.ndarray:
    cols, rows = inv_transform * (x, y)
    col = np.clip(np.floor(cols).astype(np.int64), 0, band.shape[1] - 1)
    row = np.clip(np.floor(rows).astype(np.int64), 0, band.shape[0] - 1)
    elev = band[row, col]
    valid = elev != nodata
    return elev, valid


def main() -> None:
    tile_paths = sorted(LAZ_DIR.glob("*.laz"))
    if not tile_paths:
        raise SystemExit(f"no .laz files found in {LAZ_DIR}")

    print(f"mosaicking DEM tiles from {DEM_DIR} (for building base elevation)")
    dem_band, dem_transform, dem_nodata = load_dem_mosaic()
    dem_inv_transform = ~dem_transform

    print(f"reading class-{BUILDING_CLASS} (building) points from {len(tile_paths)} tile(s)")
    x_parts, y_parts, z_parts = [], [], []
    for path in tile_paths:
        las = laspy.read(path)
        cl = np.asarray(las.classification, dtype=np.uint8)
        m = cl == BUILDING_CLASS
        x_parts.append(np.asarray(las.x, dtype=np.float64)[m])
        y_parts.append(np.asarray(las.y, dtype=np.float64)[m])
        z_parts.append(np.asarray(las.z, dtype=np.float64)[m])
        print(f"  {path.name}: {int(m.sum()):,} building points")

    x = np.concatenate(x_parts)
    y = np.concatenate(y_parts)
    z_ft = np.concatenate(z_parts)
    print(f"{x.size:,} building points total")

    # --- rasterize to a binary occupancy grid ---
    res_ft = GRID_RES_M / FT_TO_M
    west, east = x.min(), x.max()
    south, north = y.min(), y.max()
    width = int(np.ceil((east - west) / res_ft)) + 1
    height = int(np.ceil((north - south) / res_ft)) + 1
    transform = Affine(res_ft, 0, west, 0, -res_ft, north)
    inv_transform = ~transform

    cols, rows = inv_transform * (x, y)
    col = np.clip(np.floor(cols).astype(np.int64), 0, width - 1)
    row = np.clip(np.floor(rows).astype(np.int64), 0, height - 1)
    occupancy = np.zeros((height, width), dtype=bool)
    occupancy[row, col] = True

    structure = np.ones((3, 3), dtype=bool)
    print("closing/opening the occupancy raster...", flush=True)
    occupancy = ndimage.binary_closing(occupancy, structure=structure, iterations=CLOSING_ITER)
    occupancy = ndimage.binary_opening(occupancy, structure=structure, iterations=OPENING_ITER)

    labels, n_labels = ndimage.label(occupancy, structure=structure)
    print(f"{n_labels} connected building blob(s) before area filtering", flush=True)

    # per-point label, for height stats (nearest cell -- same grid as above)
    point_labels = labels[row, col]

    min_area_px = MIN_AREA_M2 / (GRID_RES_M * GRID_RES_M)
    area_counts = np.bincount(labels.ravel(), minlength=n_labels + 1)
    keep_label = area_counts >= min_area_px
    keep_label[0] = False  # background isn't a label
    dropped_small = int(n_labels - keep_label.sum())

    # Vectorize every kept blob in ONE pass over the whole raster (calling
    # shapes() per-building instead, on the full-size array each time, is
    # O(buildings x raster size) and was the original bottleneck here).
    # `connectivity=8` matches the 8-connected structure used for labeling
    # above, so a diagonally-connected blob doesn't get split into pieces.
    print("vectorizing...", flush=True)
    vector_mask = occupancy & keep_label[labels]
    poly_by_label: dict[int, list] = {}
    for geom, val in raster_shapes(labels.astype(np.int32), mask=vector_mask,
                                    transform=transform, connectivity=8):
        poly_by_label.setdefault(int(val), []).append(shapely_shape(geom))

    features = []
    for label_id, polys in poly_by_label.items():
        # rarely, a label yields >1 disjoint ring; keep the largest
        poly = max(polys, key=lambda p: p.area)
        poly = poly.simplify(SIMPLIFY_TOLERANCE_M / FT_TO_M, preserve_topology=True)
        if poly.is_empty or poly.geom_type != "Polygon" or len(poly.exterior.coords) < 4:
            continue

        pt_mask = point_labels == label_id
        if not pt_mask.any():
            continue
        roof_ft = float(np.percentile(z_ft[pt_mask], ROOF_PERCENTILE))
        cx, cy = poly.centroid.x, poly.centroid.y
        ground_elev, ground_valid = sample_dem(
            dem_band, dem_inv_transform, dem_nodata,
            np.array([cx]), np.array([cy]),
        )
        base_m = float(ground_elev[0]) * FT_TO_M if ground_valid[0] else 0.0
        roof_m = roof_ft * FT_TO_M
        bldg_height_m = max(roof_m - base_m, 1.0)  # floor at 1 m, avoid degenerate extrusions

        lons, lats = _to_lonlat.transform(*zip(*poly.exterior.coords))
        ring = [[float(lon), float(lat)] for lon, lat in zip(lons, lats)]

        features.append({
            "type": "Feature",
            "properties": {"height": round(bldg_height_m, 1), "baseHeight": round(base_m, 1)},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })

    print(f"{len(features)} building(s) kept ({dropped_small} dropped as too small)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "buildings.geojson").write_text(json.dumps({
        "type": "FeatureCollection",
        "features": features,
    }))
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "source": "Estimated from USGS 3DEP LPC building-classified (class 6) "
                  "returns, FL_Peninsular_2018_D18 (local LAZ tiles) -- NOT a "
                  "surveyed footprint dataset",
        "method": f"rasterize class-{BUILDING_CLASS} points to a {GRID_RES_M} m "
                  "grid, morphological close+open, connected-component label, "
                  "vectorize + simplify each component; height = "
                  f"P{ROOF_PERCENTILE} of the building's own point elevations "
                  "minus the DEM elevation at its footprint centroid",
        "sourceFiles": [p.name for p in tile_paths],
        "buildingCount": len(features),
        "droppedAsSmall": dropped_small,
        "minAreaM2": MIN_AREA_M2,
        "standIn": False,
    }, indent=2) + "\n")
    print(f"wrote {len(features)} building polygons -> {OUT_DIR}")


if __name__ == "__main__":
    main()
