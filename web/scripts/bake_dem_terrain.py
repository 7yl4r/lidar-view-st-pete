#!/usr/bin/env python3
"""
Bake a high-resolution elevation patch from real USGS DEM GeoTIFFs into the same
compact binary heightfield format used by `bake_terrain.py`, as a "real data"
overlay on top of the coarse metro-wide stand-in grid.

Source: local GeoTIFFs in `../../DEMs/` — USGS 3DEP Original Product Resolution
(OPR) bare-earth DEM tiles, project `FL_Peninsular_2018_D18` (same 2018 project
as the LiDAR this replaces). NAD83(2011) / Florida West (ftUS), 2.5 ft posting,
elevation in US survey feet, NAVD88 orthometric. This is real, full-resolution
elevation for the downtown/waterfront AOI — it supersedes the point-cloud layer,
which only ever existed to show real detail in this same footprint.

Output (web/public/assets/terrain/):
  dem_grid.bin    float32, row-major, row 0 = NORTH edge, col 0 = WEST edge
  dem_grid.json   { bbox, width, height, min/max, source }

`terrain.ts` samples this patch inside its bbox (feathered at the edges) and
falls back to the metro-wide `grid.bin` everywhere else.

Run:  python3 scripts/bake_dem_terrain.py
Deps: rasterio, numpy
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling

FT_TO_M = 0.3048006096012192  # US survey foot
# Left as NAVD88 orthometric metres, NOT shifted to WGS84 ellipsoidal height:
# the base metro-wide grid this patch blends into (bake_terrain.py) is also
# unshifted (its terrarium source is already ~orthometric-ish), and applying
# the correct ellipsoid shift here alone (~-25 m in Florida) would tear a
# 25 m cliff into the terrain mesh right at the patch boundary. Both grids
# share the same "orthometric metres treated as height" approximation -- see
# the vertical-datum caveat in docs/DATA_SOURCES.md.

DEM_DIR = Path(__file__).resolve().parents[2] / "DEMs"
OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "terrain"
DST_CRS = "EPSG:4326"
GRID_W = GRID_H = 1536


def main() -> None:
    tif_paths = sorted(DEM_DIR.glob("*.tif"))
    if not tif_paths:
        raise SystemExit(f"no .tif files found in {DEM_DIR}")
    print(f"mosaicking {len(tif_paths)} DEM tile(s) from {DEM_DIR}")

    srcs = [rasterio.open(p) for p in tif_paths]
    src_crs = srcs[0].crs
    src_nodata = srcs[0].nodata
    mosaic, mosaic_transform = merge(srcs, nodata=src_nodata)
    for s in srcs:
        s.close()
    band = mosaic[0]  # (rows, cols), feet, NAVD88

    dst_transform, dst_w, dst_h = calculate_default_transform(
        src_crs, DST_CRS,
        band.shape[1], band.shape[0],
        *rasterio.transform.array_bounds(band.shape[0], band.shape[1], mosaic_transform),
        dst_width=GRID_W, dst_height=GRID_H,
    )

    dst = np.full((GRID_H, GRID_W), np.nan, dtype=np.float32)
    reproject(
        source=band,
        destination=dst,
        src_transform=mosaic_transform,
        src_crs=src_crs,
        src_nodata=src_nodata,
        dst_transform=dst_transform,
        dst_crs=DST_CRS,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )

    # A geographic (WGS84) grid isn't axis-aligned with the source's projected
    # CRS, so a handful of cells at the rectangular grid's edges fall just
    # outside the (rotated) source footprint. Fill those from the nearest
    # valid cell rather than dropping to the coarse fallback right at the
    # patch boundary.
    invalid = np.isnan(dst)
    n_invalid = int(invalid.sum())
    if n_invalid:
        from scipy import ndimage
        frac = n_invalid / dst.size
        if frac > 0.02:
            raise SystemExit(
                f"DEM mosaic has {n_invalid} unfilled cells ({frac:.1%}) after "
                "reprojection -- source tiles don't fully cover the output grid"
            )
        _, (iy, ix) = ndimage.distance_transform_edt(
            invalid, return_indices=True
        )
        dst = dst[iy, ix]
        print(f"filled {n_invalid} edge cells ({frac:.2%}) from nearest valid neighbor")

    grid = (dst * FT_TO_M).astype(np.float32)

    west, north = dst_transform * (0, 0)
    east, south = dst_transform * (GRID_W, GRID_H)

    OUT.mkdir(parents=True, exist_ok=True)
    grid.tofile(OUT / "dem_grid.bin")
    (OUT / "dem_grid.json").write_text(json.dumps({
        "source": "USGS 3DEP OPR DEM, FL_Peninsular_2018_D18 (local GeoTIFF tiles)",
        "sourceNote": f"{len(tif_paths)} tiles mosaicked, 2.5 ft native posting, "
                      "resampled to this grid; bare-earth NAVD88 orthometric metres, "
                      "NOT shifted to WGS84 ellipsoidal height (kept in the same "
                      "approximation as the base grid so the two blend without a "
                      "seam -- replace with a real geoid model for production)",
        "sourceFiles": [p.name for p in tif_paths],
        "bbox": {"west": west, "south": south, "east": east, "north": north},
        "width": GRID_W,
        "height": GRID_H,
        "rowOrder": "north-to-south",
        "colOrder": "west-to-east",
        "elevation": "metres, WGS84 ellipsoid approx",
        "min": float(grid.min()),
        "max": float(grid.max()),
        "standIn": False,
    }, indent=2) + "\n")
    print(f"grid {GRID_W}x{GRID_H}  elev {grid.min():.1f}..{grid.max():.1f} m  "
          f"bbox ({west:.5f},{south:.5f})..({east:.5f},{north:.5f})  "
          f"-> {OUT/'dem_grid.bin'} ({(OUT/'dem_grid.bin').stat().st_size//1024} KiB)")


if __name__ == "__main__":
    main()
