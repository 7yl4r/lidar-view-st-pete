#!/usr/bin/env python3
"""
Bake a self-hosted 3D Tiles point cloud from local USGS LiDAR Point Cloud
(LPC) .laz tiles.

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
- reprojects X/Y (state plane feet) -> WGS84 lon/lat -> ECEF, and converts Z
  feet -> metres *without* an ellipsoid/geoid shift, matching the terrain and
  DEM-surface layers' convention (see bake_dem_terrain.py) so the point cloud
  isn't offset ~25 m from the ground it should sit on
- colours points by ASPRS classification (ground / building / water / veg / ...)
- writes one `.pnts` (3D Tiles 1.0 point cloud) per input tile plus a
  single-level tileset.json (a synthetic root wrapping the 4 tiles as leaf
  children, refine ADD) -- no octree/LOD within a tile, unlike the old
  EPT-based pipeline this replaces, which had a pre-built spatial index to tile
  against and this doesn't

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
_to_ecef = Transformer.from_crs(4326, 4978, always_xy=True)


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


def write_pnts(path: Path, positions: np.ndarray, rgb: np.ndarray,
               rtc_center: np.ndarray) -> None:
    n = positions.shape[0]
    bin_body = positions.tobytes() + rgb.tobytes()
    ft = {
        "POINTS_LENGTH": n,
        "RTC_CENTER": [float(v) for v in rtc_center],
        "POSITION": {"byteOffset": 0},
        "RGB": {"byteOffset": n * 12},
    }
    ft_json = json.dumps(ft, separators=(",", ":")).encode("utf-8")
    ft_json += b" " * ((8 - (28 + len(ft_json)) % 8) % 8)          # 8-byte align
    bin_body += b"\x00" * ((8 - len(bin_body) % 8) % 8)
    header = b"pnts" + struct.pack(
        "<IIIIII", 1, 28 + len(ft_json) + len(bin_body),
        len(ft_json), len(bin_body), 0, 0,
    )
    path.write_bytes(header + ft_json + bin_body)


def process_tile(
    path: Path, dem: DemMosaic, frac: float, rng: np.random.Generator,
) -> tuple[dict | None, int]:
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
    if not m.any():
        return None, n_below

    x = x[m]
    y = y[m]
    z_m = z_ft[m] * FT_TO_M
    cl = cl[m]

    lon, lat = _to_lonlat.transform(x, y)
    ex, ey, ez = _to_ecef.transform(lon, lat, z_m)
    ecef = np.column_stack([ex, ey, ez])
    center = ecef.mean(axis=0)
    rel = (ecef - center).astype(np.float32)
    radius = float(np.linalg.norm(rel, axis=1).max()) + 1.0

    rgb = np.empty((cl.size, 3), dtype=np.uint8)
    rgb[:] = DEFAULT_COLOR
    for c, col in CLASS_COLOR.items():
        rgb[cl == c] = col

    out_name = f"{path.stem}.pnts"
    write_pnts(OUT_DIR / out_name, rel, rgb, center)
    return ({"uri": out_name, "center": center.tolist(), "radius": radius,
              "count": int(cl.size)}, n_below)


def build_tileset(tiles: list[dict]) -> dict:
    children = [
        {
            "boundingVolume": {"sphere": [*t["center"], t["radius"]]},
            "geometricError": 0.0,  # leaf: no finer replacement exists
            "refine": "ADD",
            "content": {"uri": t["uri"]},
        }
        for t in tiles
    ]
    centers = np.array([t["center"] for t in tiles])
    c = centers.mean(axis=0)
    r = float(np.max(np.linalg.norm(centers - c, axis=1)
                      + np.array([t["radius"] for t in tiles]))) + 1.0
    return {
        "asset": {"version": "1.1"},
        "geometricError": 64.0,
        "root": {
            "boundingVolume": {"sphere": [*c.tolist(), r]},
            "geometricError": 32.0,
            "refine": "ADD",
            "children": children,
        },
    }


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
    for old in OUT_DIR.glob("*.pnts"):
        old.unlink()

    rng = np.random.default_rng(1748)
    tiles: list[dict] = []
    written = 0
    dropped_below_dem = 0
    for path in tile_paths:
        frac = min(1.0, POINT_BUDGET * (counts[path] / total) / counts[path])
        result, n_below = process_tile(path, dem, frac, rng)
        dropped_below_dem += n_below
        if result:
            tiles.append(result)
            written += result["count"]
            print(f"  {path.name}: {counts[path]:,} -> {result['count']:,} points "
                  f"({n_below:,} below DEM dropped)")

    if not tiles:
        raise SystemExit("no points survived filtering -- check the input tiles")

    (OUT_DIR / "tileset.json").write_text(json.dumps(build_tileset(tiles)))
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "source": "USGS 3DEP LPC, FL_Peninsular_2018_D18 (local LAZ tiles)",
        "sourceNote": f"{len(tile_paths)} full-density tiles decimated to a "
                      f"{POINT_BUDGET:,}-point budget; not shifted to WGS84 "
                      "ellipsoidal height (kept in the same approximation as "
                      "the terrain/DEM-surface layers so they align); points "
                      "below the DEM (../DEMs/*.tif) at their X/Y are dropped "
                      "as below-ground noise",
        "sourceFiles": [p.name for p in tile_paths],
        "pointCount": written,
        "droppedBelowDem": dropped_below_dem,
        "standIn": False,
    }, indent=2) + "\n")
    print(f"wrote {written:,} points across {len(tiles)} tiles "
          f"({dropped_below_dem:,} below-DEM points dropped total) -> {OUT_DIR}")


if __name__ == "__main__":
    main()
