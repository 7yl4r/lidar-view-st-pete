#!/usr/bin/env python3
"""
Bake a self-hosted point cloud from local USGS LiDAR Point Cloud (LPC) .laz
tiles.

Source: local full-density LAZ tiles in `../../laz/` at the repo root --
downloaded manually (not fetched at build time; see README "Data"). Same USGS
3DEP project and AOI as the DEM GeoTIFFs in `../../DEMs/`
(`FL_Peninsular_2018_D18`, NAD83(2011) / Florida West (ftUS), EPSG:6443, Z in
NAVD88 orthometric feet) -- these are the discrete return points behind that
bare-earth raster.

What this does
--------------
- mosaics the DEM GeoTIFFs in `../../DEMs/` (native CRS/units -- no
  reprojection needed here, unlike bake_dem_terrain.py, since we're comparing
  against LAZ points in that same CRS) and, per tile, drops any LAZ point
  whose Z falls below the DEM's ground elevation directly beneath it -- these
  are below-ground blunders (multipath, water penetration, noise) that a
  bare-earth DEM has already been cleaned of
- reads each tile's full point count from its header (cheap), then decimates
  proportionally to a fixed total point budget -- a full-density tile here is
  20-40M points, far too many for a browser
- drops noise classes (7, 18)
- reprojects X/Y (state plane feet) -> WGS84 lon/lat, and converts Z feet ->
  metres *without* an ellipsoid/geoid shift, matching the terrain and
  DEM-surface layers' convention (see bake_dem_terrain.py) so the point cloud
  isn't offset ~25 m from the ground it should sit on
- colours points by ASPRS classification (ground / building / water / veg / ...)
- writes ONE flat binary file: lon (float64) / lat (float64) / real height in
  metres (float32) / rgb (uint8 x3) per point, all tiles combined. No 3D
  Tiles, no octree/LOD, no ECEF/RTC baked in -- `pointCloudLayer.ts` derives
  each point's rendered position at runtime from lon/lat/height through the
  exact same shared method `demLayer.ts` uses (see `exaggeration.ts`), so the
  two can't drift apart the way a point cloud baked into absolute ECEF and a
  terrain-relative surface can.

Run:  python3 scripts/bake_pointcloud.py
Deps: laspy[lazrs], pyproj, rasterio, numpy
      (pip install "laspy[lazrs]" pyproj rasterio numpy)
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import laspy
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.merge import merge as merge_rasters

LAZ_DIR = Path(__file__).resolve().parents[2] / "laz"
DEM_DIR = Path(__file__).resolve().parents[2] / "DEMs"
OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "pointcloud"

SRC_CRS = 6443  # NAD83(2011) / Florida West (ftUS) -- matches the DEM tiles
POINT_BUDGET = 3_000_000
FT_TO_M = 0.3048006096012192  # US survey foot

# ASPRS classification -> RGB (matches the point-cloud layer this replaces)
CLASS_COLOR = {
    1: (150, 150, 150),   # unclassified
    2: (176, 152, 115),   # ground
    3: (104, 148, 92),    # low vegetation
    4: (78, 140, 66),     # medium vegetation
    5: (54, 122, 48),     # high vegetation
    6: (198, 93, 59),     # building
    9: (46, 110, 142),    # water
    17: (140, 120, 100),  # bridge deck
}
DEFAULT_COLOR = (170, 170, 175)
DROP_CLASSES = {7, 18}  # low/high noise

_to_lonlat = Transformer.from_crs(SRC_CRS, 4326, always_xy=True)


class DemMosaic:
    """Ground elevation (native DEM units/CRS, feet) at arbitrary X/Y, for
    dropping LAZ points that fall below it."""

    def __init__(self, dem_dir: Path) -> None:
        tif_paths = sorted(dem_dir.glob("*.tif"))
        if not tif_paths:
            raise SystemExit(f"no .tif files found in {dem_dir}")
        srcs = [rasterio.open(p) for p in tif_paths]
        nodata = srcs[0].nodata
        band, transform = merge_rasters(srcs, nodata=nodata)
        for s in srcs:
            s.close()
        self.band = band[0]
        self.nodata = nodata
        self.inv_transform = ~transform

    def sample(self, x: np.ndarray, y: np.ndarray) -> np.ma.MaskedArray:
        """DEM elevation at each (x, y); masked where off-raster or nodata."""
        cols, rows = self.inv_transform * (x, y)
        col = np.floor(cols).astype(np.int64)
        row = np.floor(rows).astype(np.int64)
        in_bounds = (
            (row >= 0) & (row < self.band.shape[0])
            & (col >= 0) & (col < self.band.shape[1])
        )
        elev = np.full(x.shape, self.nodata, dtype=self.band.dtype)
        elev[in_bounds] = self.band[row[in_bounds], col[in_bounds]]
        return np.ma.masked_equal(elev, self.nodata)


def process_tile(
    path: Path, dem: DemMosaic, frac: float, rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int]:
    """Returns (lon, lat, height_m, rgb[N,3], n_dropped_below_dem)."""
    las = laspy.read(path)
    cl = np.asarray(las.classification, dtype=np.uint8)
    x = np.asarray(las.x, dtype=np.float64)
    y = np.asarray(las.y, dtype=np.float64)
    z_ft = np.asarray(las.z, dtype=np.float64)

    ground = dem.sample(x, y)
    # ground.mask is True where the DEM has no data for that point (off-raster
    # or nodata) -- keep those rather than guessing; only drop points we can
    # actually confirm are below the bare-earth surface.
    below_dem = (~ground.mask) & (z_ft < ground.data)
    n_below = int(below_dem.sum())

    m = ~below_dem
    for dc in DROP_CLASSES:
        m &= cl != dc
    if frac < 1.0:
        m &= rng.random(cl.shape) < frac

    x, y, z_ft, cl = x[m], y[m], z_ft[m], cl[m]
    lon, lat = _to_lonlat.transform(x, y)
    height_m = (z_ft * FT_TO_M).astype(np.float32)

    rgb = np.empty((cl.size, 3), dtype=np.uint8)
    rgb[:] = DEFAULT_COLOR
    for c, col in CLASS_COLOR.items():
        rgb[cl == c] = col

    return (
        np.asarray(lon, dtype=np.float64),
        np.asarray(lat, dtype=np.float64),
        height_m,
        rgb,
        n_below,
    )


def write_pointcloud_bin(
    path: Path, lon: np.ndarray, lat: np.ndarray, height_m: np.ndarray, rgb: np.ndarray,
) -> None:
    """[lon f64 * N][lat f64 * N][height_m f32 * N][rgb u8 * N*3], all little-endian."""
    with open(path, "wb") as f:
        f.write(lon.astype("<f8").tobytes())
        f.write(lat.astype("<f8").tobytes())
        f.write(height_m.astype("<f4").tobytes())
        f.write(rgb.astype(np.uint8).tobytes())


def main() -> None:
    tile_paths = sorted(LAZ_DIR.glob("*.laz"))
    if not tile_paths:
        raise SystemExit(f"no .laz files found in {LAZ_DIR}")

    counts = {p: laspy.open(p).header.point_count for p in tile_paths}
    total = sum(counts.values())
    print(f"{len(tile_paths)} tile(s), {total:,} points total, "
          f"budget {POINT_BUDGET:,} ({100 * POINT_BUDGET / total:.2f}%)")

    print(f"mosaicking DEM tiles from {DEM_DIR} (for below-ground filtering)")
    dem = DemMosaic(DEM_DIR)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in list(OUT_DIR.glob("*.pnts")) + [OUT_DIR / "tileset.json"]:
        old.unlink(missing_ok=True)

    rng = np.random.default_rng(1748)
    lon_parts: list[np.ndarray] = []
    lat_parts: list[np.ndarray] = []
    height_parts: list[np.ndarray] = []
    rgb_parts: list[np.ndarray] = []
    dropped_below_dem = 0
    for path in tile_paths:
        frac = min(1.0, POINT_BUDGET * (counts[path] / total) / counts[path])
        lon, lat, height_m, rgb, n_below = process_tile(path, dem, frac, rng)
        dropped_below_dem += n_below
        lon_parts.append(lon)
        lat_parts.append(lat)
        height_parts.append(height_m)
        rgb_parts.append(rgb)
        print(f"  {path.name}: {counts[path]:,} -> {lon.size:,} points "
              f"({n_below:,} below DEM dropped)")

    lon = np.concatenate(lon_parts)
    lat = np.concatenate(lat_parts)
    height_m = np.concatenate(height_parts)
    rgb = np.concatenate(rgb_parts)
    written = lon.size

    write_pointcloud_bin(OUT_DIR / "pointcloud.bin", lon, lat, height_m, rgb)
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "source": "USGS 3DEP LPC, FL_Peninsular_2018_D18 (local LAZ tiles)",
        "sourceNote": f"{len(tile_paths)} full-density tiles decimated to a "
                      f"{POINT_BUDGET:,}-point budget; height is real "
                      "(unexaggerated) orthometric metres, not shifted to "
                      "WGS84 ellipsoidal height (kept in the same "
                      "approximation as the terrain/DEM-surface layers so "
                      "they align); points below the DEM (../DEMs/*.tif) at "
                      "their X/Y are dropped as below-ground noise",
        "sourceFiles": [p.name for p in tile_paths],
        "format": "pointcloud.bin: lon f64[N], lat f64[N], height_m f32[N], rgb u8[N,3]",
        "pointCount": int(written),
        "droppedBelowDem": int(dropped_below_dem),
        "heightMin": float(height_m.min()),
        "heightMax": float(height_m.max()),
        "standIn": False,
    }, indent=2) + "\n")
    print(f"wrote {written:,} points "
          f"({dropped_below_dem:,} below-DEM points dropped total) -> {OUT_DIR}")


if __name__ == "__main__":
    main()
