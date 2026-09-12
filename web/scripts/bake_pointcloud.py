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
Deps: laspy[lazrs], pyproj, numpy  (pip install "laspy[lazrs]" pyproj numpy)
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import laspy
import numpy as np
from pyproj import Transformer

LAZ_DIR = Path(__file__).resolve().parents[2] / "laz"
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


def process_tile(path: Path, frac: float, rng: np.random.Generator) -> dict | None:
    las = laspy.read(path)
    cl = np.asarray(las.classification, dtype=np.uint8)
    m = np.ones(cl.shape, dtype=bool)
    for dc in DROP_CLASSES:
        m &= cl != dc
    if frac < 1.0:
        m &= rng.random(cl.shape) < frac
    if not m.any():
        return None

    x = np.asarray(las.x, dtype=np.float64)[m]
    y = np.asarray(las.y, dtype=np.float64)[m]
    z_m = np.asarray(las.z, dtype=np.float64)[m] * FT_TO_M
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
    return {"uri": out_name, "center": center.tolist(), "radius": radius,
            "count": int(cl.size)}


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

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.pnts"):
        old.unlink()

    rng = np.random.default_rng(1748)
    tiles: list[dict] = []
    written = 0
    for path in tile_paths:
        frac = min(1.0, POINT_BUDGET * (counts[path] / total) / counts[path])
        result = process_tile(path, frac, rng)
        if result:
            tiles.append(result)
            written += result["count"]
            print(f"  {path.name}: {counts[path]:,} -> {result['count']:,} points")

    if not tiles:
        raise SystemExit("no points survived filtering -- check the input tiles")

    (OUT_DIR / "tileset.json").write_text(json.dumps(build_tileset(tiles)))
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "source": "USGS 3DEP LPC, FL_Peninsular_2018_D18 (local LAZ tiles)",
        "sourceNote": f"{len(tile_paths)} full-density tiles decimated to a "
                      f"{POINT_BUDGET:,}-point budget; not shifted to WGS84 "
                      "ellipsoidal height (kept in the same approximation as "
                      "the terrain/DEM-surface layers so they align)",
        "sourceFiles": [p.name for p in tile_paths],
        "pointCount": written,
        "standIn": False,
    }, indent=2) + "\n")
    print(f"wrote {written:,} points across {len(tiles)} tiles -> {OUT_DIR}")


if __name__ == "__main__":
    main()
