#!/usr/bin/env python3
"""
Fetch a REAL LiDAR subset for a downtown/waterfront AOI of St. Petersburg, FL and
write it as a CesiumJS-ready 3D Tiles point cloud (.pnts).

Source
------
USGS 3DEP  "FL_Peninsular_Pinellas_2018"  (nominal pulse spacing 0.35 m),
published as public Entwine Point Tiles (EPT):
  https://s3-us-west-2.amazonaws.com/usgs-lidar-public/FL_Peninsular_Pinellas_2018/ept.json
EPT CRS is EPSG:3857; Z is NAVD88 orthometric metres.

What this does
--------------
- walks the EPT octree hierarchy, keeping nodes that intersect the AOI down to
  MAX_DEPTH
- downloads those nodes' LAZ, drops noise classes, optionally subsamples to a
  point budget
- reprojects 3857 + (Z + GEOID_OFFSET) -> ECEF (EPSG:4978); the constant geoid
  shift is a coarse NAVD88->ellipsoid correction for this area (GEOID18 ~ -25.5 m)
  and should be replaced by a proper geoid model in the real pipeline
- colours points by ASPRS classification (ground / building / water / veg / ...)
- emits one .pnts per octree node and a tileset.json mirroring the octree
  (refine ADD), into web/public/assets/pointcloud/

Run:  python3 scripts/fetch_lidar.py
Deps: laspy[lazrs], numpy, pyproj  (pip install "laspy[lazrs]" pyproj numpy)
"""
from __future__ import annotations

import io
import json
import math
import struct
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import laspy
import numpy as np
from pyproj import Transformer

EPT_BASE = (
    "https://s3-us-west-2.amazonaws.com/usgs-lidar-public/"
    "FL_Peninsular_Pinellas_2018"
)

# AOI: downtown St. Petersburg core + the waterfront / pier (WGS84 degrees)
AOI = dict(west=-82.650, south=27.762, east=-82.624, north=27.781)

MAX_DEPTH = 9           # deeper = finer detail, more nodes/files
POINT_BUDGET = 2_200_000
GEOID_OFFSET = -25.5    # metres, NAVD88 -> WGS84 ellipsoid (approx, GEOID18 @ St Pete)
DOWNLOAD_WORKERS = 12

OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "pointcloud"

# ASPRS classification -> RGB
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
DROP_CLASSES = {7, 18}   # low/high noise

_to_lonlat = Transformer.from_crs(3857, 4326, always_xy=True)
_to_ecef = Transformer.from_crs(4326, 4978, always_xy=True)


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


_PAGE_CACHE: dict[str, dict] = {}


def load_page(key: str) -> dict:
    if key not in _PAGE_CACHE:
        _PAGE_CACHE[key] = json.loads(
            fetch(f"{EPT_BASE}/ept-hierarchy/{key}.json")
        )
    return _PAGE_CACHE[key]


def collect_aoi_nodes(
    cube: list[float], aoi_merc: tuple[float, float, float, float], max_depth: int
) -> list[tuple[str, int]]:
    """Walk the octree, descending ONLY into nodes that intersect the AOI.

    A hierarchy page value of -1 means the node's real count + subtree live in a
    separate page named by that node key.
    """
    ax0, ay0, ax1, ay1 = aoi_merc
    kept: list[tuple[str, int]] = []
    stack: list[tuple[str, dict]] = [("0-0-0-0", load_page("0-0-0-0"))]
    while stack:
        key, page = stack.pop()
        cnt = page.get(key)
        if cnt is None:
            continue
        if cnt == -1:
            page = load_page(key)
            cnt = page.get(key, 0)
        if cnt <= 0:
            continue
        kept.append((key, cnt))
        depth = int(key.split("-")[0])
        if depth >= max_depth:
            continue
        d, x, y, z = (int(p) for p in key.split("-"))
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    ck = f"{d + 1}-{2 * x + dx}-{2 * y + dy}-{2 * z + dz}"
                    nx0, ny0, nx1, ny1 = node_bounds(cube, ck)
                    if nx1 < ax0 or nx0 > ax1 or ny1 < ay0 or ny0 > ay1:
                        continue
                    stack.append((ck, page))
    return kept


def node_bounds(cube: list[float], key: str) -> tuple[float, float, float, float]:
    d, x, y, _z = (int(p) for p in key.split("-"))
    n = 2**d
    sx = (cube[3] - cube[0]) / n
    sy = (cube[4] - cube[1]) / n
    x0 = cube[0] + x * sx
    y0 = cube[1] + y * sy
    return x0, y0, x0 + sx, y0 + sy


def main() -> None:
    ept = json.loads(fetch(f"{EPT_BASE}/ept.json"))
    cube = ept["bounds"]
    print(f"EPT: {ept['points']:,} points, span {ept['span']}, CRS EPSG:{ept['srs']['horizontal']}")

    # AOI in EPT CRS (3857)
    to_merc = Transformer.from_crs(4326, 3857, always_xy=True)
    ax0, ay0 = to_merc.transform(AOI["west"], AOI["south"])
    ax1, ay1 = to_merc.transform(AOI["east"], AOI["north"])
    print(f"AOI (3857): x[{ax0:.0f},{ax1:.0f}] y[{ay0:.0f},{ay1:.0f}]  "
          f"~{(ax1-ax0):.0f} x {(ay1-ay0):.0f} m")

    print("walking octree hierarchy (AOI-pruned)…")
    keep = collect_aoi_nodes(cube, (ax0, ay0, ax1, ay1), MAX_DEPTH)
    keep.sort(key=lambda kc: (int(kc[0].split("-")[0]), kc[0]))
    total = sum(c for _, c in keep)
    print(f"{len(keep)} nodes intersect AOI ({len(_PAGE_CACHE)} hierarchy pages), "
          f"{total:,} points before filtering")
    frac = min(1.0, POINT_BUDGET / max(1, total))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.pnts"):
        old.unlink()

    def process(item: tuple[str, int]):
        key, _count = item
        raw = fetch(f"{EPT_BASE}/ept-data/{key}.laz")
        las = laspy.read(io.BytesIO(raw))
        x = np.asarray(las.x, dtype=np.float64)
        y = np.asarray(las.y, dtype=np.float64)
        z = np.asarray(las.z, dtype=np.float64)
        cl = np.asarray(las.classification, dtype=np.uint8)

        m = (x >= ax0) & (x <= ax1) & (y >= ay0) & (y <= ay1)
        for dc in DROP_CLASSES:
            m &= cl != dc
        if frac < 1.0:
            m &= np.random.random(x.shape) < frac
        if not m.any():
            return key, 0, None

        x, y, z, cl = x[m], y[m], z[m], cl[m]
        lon, lat = _to_lonlat.transform(x, y)
        ex, ey, ez = _to_ecef.transform(lon, lat, z + GEOID_OFFSET)
        ecef = np.column_stack([ex, ey, ez])
        center = ecef.mean(axis=0)
        rel = (ecef - center).astype(np.float32)
        # floor the bounding radius at the octree node's own footprint so a
        # sparsely-sampled tile still has a sane (non-degenerate) bounding volume
        nx0, ny0, nx1, ny1 = node_bounds(cube, key)
        node_span = math.hypot(nx1 - nx0, ny1 - ny0)
        radius = max(
            float(np.linalg.norm(rel, axis=1).max()) + 1.0,
            0.6 * node_span,
        )

        rgb = np.empty((cl.size, 3), dtype=np.uint8)
        rgb[:] = DEFAULT_COLOR
        for c, col in CLASS_COLOR.items():
            rgb[cl == c] = col

        write_pnts(OUT_DIR / f"{key}.pnts", rel, rgb, center)
        return key, int(cl.size), (center.tolist(), radius)

    results: dict[str, tuple] = {}
    written = 0
    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as pool:
        for key, n, sphere in pool.map(process, keep):
            if n and sphere:
                results[key] = sphere
                written += n
    print(f"wrote {written:,} points across {len(results)} tiles")

    build_tileset(cube, results)
    (OUT_DIR / "meta.json").write_text(json.dumps({
        "source": "USGS 3DEP FL_Peninsular_Pinellas_2018 (EPT)",
        "sourceUrl": f"{EPT_BASE}/ept.json",
        "acquired": "2018",
        "nominalPulseSpacing_m": 0.35,
        "aoiWGS84": AOI,
        "pointCount": written,
        "verticalNote": f"Z shifted {GEOID_OFFSET} m (approx NAVD88->ellipsoid); "
                        "replace with a real geoid model in the data pipeline.",
        "standIn": False,
    }, indent=2) + "\n")
    print(f"done -> {OUT_DIR}")


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


def build_tileset(cube: list[float], nodes: dict[str, tuple]) -> None:
    """Reconstruct the octree parent/child structure for the kept nodes."""

    def children(key: str) -> list[str]:
        d, x, y, z = (int(p) for p in key.split("-"))
        out = []
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    ck = f"{d + 1}-{2 * x + dx}-{2 * y + dy}-{2 * z + dz}"
                    if ck in nodes:
                        out.append(ck)
        return out

    def tile(key: str) -> dict:
        center, radius = nodes[key]
        depth = int(key.split("-")[0])
        node = {
            "boundingVolume": {"sphere": [*center, radius]},
            "geometricError": max(0.0, 24.0 / (2**depth)),
            "refine": "ADD",
            "content": {"uri": f"{key}.pnts"},
        }
        kids = [tile(c) for c in children(key)]
        if kids:
            node["children"] = kids
        return node

    roots = sorted(
        (k for k in nodes if not _parent_in(k, nodes)),
        key=lambda k: (int(k.split("-")[0]), k),
    )
    if len(roots) == 1:
        root_tile = tile(roots[0])
    else:
        # synthesize a wrapper root covering all kept roots
        centers = np.array([nodes[k][0] for k in roots])
        c = centers.mean(axis=0)
        r = float(np.max(np.linalg.norm(centers - c, axis=1)
                         + np.array([nodes[k][1] for k in roots]))) + 1.0
        root_tile = {
            "boundingVolume": {"sphere": [*c.tolist(), r]},
            "geometricError": 32.0,
            "refine": "ADD",
            "children": [tile(k) for k in roots],
        }

    tileset = {
        "asset": {"version": "1.1"},
        "geometricError": 64.0,
        "root": root_tile,
    }
    (OUT_DIR / "tileset.json").write_text(json.dumps(tileset))


def _parent_in(key: str, nodes: dict) -> bool:
    d, x, y, z = (int(p) for p in key.split("-"))
    if d == 0:
        return False
    return f"{d - 1}-{x // 2}-{y // 2}-{z // 2}" in nodes


if __name__ == "__main__":
    main()
