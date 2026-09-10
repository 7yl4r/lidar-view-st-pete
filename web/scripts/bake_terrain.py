#!/usr/bin/env python3
"""
Bake a REAL elevation grid for the St. Petersburg metro into a compact binary
heightfield the app serves itself.

Source: AWS "elevation-tiles-prod" terrarium tiles (keyless, public) — a global
mosaic built from USGS 3DEP/NED + SRTM. Effective resolution here ~10 m; this is
the deliberately-low-res stand-in for a LiDAR-derived DTM (see docs/DATA_SOURCES.md).

Output (web/public/assets/terrain/):
  grid.bin    float32, row-major, row 0 = NORTH edge, col 0 = WEST edge
  grid.json   { bbox, width, height, min/max, source }

Run:  python3 scripts/bake_terrain.py
Deps: numpy, pillow
"""
from __future__ import annotations

import io
import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

# Metro bbox — wider than the city so the real relief up the peninsula shows.
BBOX = dict(west=-82.80, south=27.55, east=-82.35, north=28.05)
ZOOM = 13
GRID_W = GRID_H = 1024
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "terrain"


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2**z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y


def fetch_tile(z: int, x: int, y: int) -> np.ndarray:
    url = TILE_URL.format(z=z, x=x, y=y)
    try:
        raw = urllib.request.urlopen(url, timeout=30).read()
        a = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"), dtype=np.float64)
        return a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0
    except Exception:
        return np.zeros((256, 256), dtype=np.float64)


def main() -> None:
    x0f, y0f = lonlat_to_tile(BBOX["west"], BBOX["north"], ZOOM)  # NW
    x1f, y1f = lonlat_to_tile(BBOX["east"], BBOX["south"], ZOOM)  # SE
    tx0, tx1 = int(math.floor(x0f)), int(math.floor(x1f))
    ty0, ty1 = int(math.floor(y0f)), int(math.floor(y1f))
    tiles = [(tx, ty) for tx in range(tx0, tx1 + 1) for ty in range(ty0, ty1 + 1)]
    print(f"z{ZOOM}: {len(tiles)} terrarium tiles "
          f"(x {tx0}..{tx1}, y {ty0}..{ty1})")

    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float64)
    with ThreadPoolExecutor(max_workers=16) as pool:
        futs = {pool.submit(fetch_tile, ZOOM, tx, ty): (tx, ty) for tx, ty in tiles}
        for fut in futs:
            tx, ty = futs[fut]
            block = fut.result()
            r = (ty - ty0) * 256
            c = (tx - tx0) * 256
            mosaic[r:r + 256, c:c + 256] = block

    # world pixel span of the mosaic
    px_w = mosaic.shape[1]
    px_h = mosaic.shape[0]
    # fractional pixel coords of the bbox corners within the mosaic
    fx0 = (x0f - tx0) * 256.0
    fy0 = (y0f - ty0) * 256.0
    fx1 = (x1f - tx0) * 256.0
    fy1 = (y1f - ty0) * 256.0

    # resample mosaic -> GRID_H x GRID_W over exactly the bbox (row 0 = north)
    cols = np.clip(np.linspace(fx0, fx1, GRID_W), 0, px_w - 1)
    rows = np.clip(np.linspace(fy0, fy1, GRID_H), 0, px_h - 1)
    c0 = np.floor(cols).astype(int); c1 = np.clip(c0 + 1, 0, px_w - 1)
    r0 = np.floor(rows).astype(int); r1 = np.clip(r0 + 1, 0, px_h - 1)
    wc = (cols - c0)[None, :]
    wr = (rows - r0)[:, None]
    top = mosaic[np.ix_(r0, c0)] * (1 - wc) + mosaic[np.ix_(r0, c1)] * wc
    bot = mosaic[np.ix_(r1, c0)] * (1 - wc) + mosaic[np.ix_(r1, c1)] * wc
    grid = (top * (1 - wr) + bot * wr).astype(np.float32)

    # ocean noise / voids -> 0
    grid[grid < -12.0] = 0.0

    OUT.mkdir(parents=True, exist_ok=True)
    grid.tofile(OUT / "grid.bin")
    (OUT / "grid.json").write_text(json.dumps({
        "source": "AWS elevation-tiles-prod terrarium (USGS 3DEP/NED + SRTM)",
        "sourceNote": "keyless public mosaic; ~10 m effective; stand-in for a "
                      "LiDAR-derived DTM",
        "sourceUrl": TILE_URL,
        "zoom": ZOOM,
        "bbox": BBOX,
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
          f"-> {OUT/'grid.bin'} ({(OUT/'grid.bin').stat().st_size//1024} KiB)")


if __name__ == "__main__":
    main()
