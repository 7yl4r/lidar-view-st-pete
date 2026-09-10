#!/usr/bin/env python3
"""
Generate stand-in assets for the LiDAR viewer Phase 0 demo.

NOTHING here is real data. These files exist so the app has something to render
until the separate data-transformation project delivers real tiles/meshes to the
same paths. Outputs:

  public/assets/basemap/stpete-basemap.png      stylized "aerial" for the city rect
  public/assets/basemap/stpete-basemap.json     the geographic bounds of that PNG
  public/assets/basemap/world-fallback.png      low-res global ocean fallback
  public/assets/buildings/stpete-buildings.geojson   procedural extruded footprints

Run:  python3 scripts/gen_standins.py
"""
from __future__ import annotations

import json
import math
import pathlib
import random

import numpy as np
from PIL import Image, ImageDraw

random.seed(1748)
np.random.seed(1748)

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASEMAP_DIR = ROOT / "public" / "assets" / "basemap"
BUILD_DIR = ROOT / "public" / "assets" / "buildings"
BASEMAP_DIR.mkdir(parents=True, exist_ok=True)
BUILD_DIR.mkdir(parents=True, exist_ok=True)

# Geographic extent of the stand-in basemap (WGS84 degrees).
# Roughly the St. Petersburg / Pinellas peninsula with Tampa Bay to the east.
WEST, SOUTH, EAST, NORTH = -82.78, 27.63, -82.55, 27.86

# Downtown core used to weight building heights and grid density.
CORE_LON, CORE_LAT = -82.6370, 27.7715


# --------------------------------------------------------------------------- #
# value-noise helper (no external noise lib available)
# --------------------------------------------------------------------------- #
def value_noise(h: int, w: int, scale: int, octaves: int = 4) -> np.ndarray:
    out = np.zeros((h, w), dtype=np.float64)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh = max(2, scale * (2 ** o))
        gw = max(2, scale * (2 ** o))
        grid = np.random.rand(gh, gw)
        img = np.array(Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
                       dtype=np.float64) / 255.0
        out += amp * img
        tot += amp
        amp *= 0.5
    return out / tot


# --------------------------------------------------------------------------- #
# basemap
# --------------------------------------------------------------------------- #
def make_basemap(px: int = 2048) -> None:
    h = w = px
    ys = np.linspace(0.0, 1.0, h)[:, None]          # 0 = north, 1 = south
    xs = np.linspace(0.0, 1.0, w)[None, :]          # 0 = west, 1 = east
    lon = WEST + xs * (EAST - WEST)
    lat = NORTH - ys * (NORTH - SOUTH)

    n_coast = value_noise(h, w, 3, octaves=5)
    n_fine = value_noise(h, w, 8, octaves=4)

    # Land mask: a peninsula down the middle. West edge = Boca Ciega Bay,
    # east side = Tampa Bay. Wobble the shoreline with noise.
    west_sh = 0.20 + 0.06 * (n_coast - 0.5) * 2
    east_sh = 0.60 + 0.10 * (n_coast[:, ::-1] - 0.5) * 2
    xn = np.broadcast_to(xs, (h, w))
    land = (xn > west_sh) & (xn < east_sh)
    # a couple of offshore islands to the east
    for (cx, cy, r) in [(0.66, 0.30, 0.035), (0.63, 0.62, 0.028), (0.70, 0.78, 0.022)]:
        d = np.sqrt(((xn - cx) * 1.0) ** 2 + ((np.broadcast_to(ys, (h, w)) - cy)) ** 2)
        land |= d < (r * (0.8 + 0.4 * n_fine))

    img = np.zeros((h, w, 3), dtype=np.float64)

    # --- water: teal near shore -> deep blue offshore (eastward) ---
    deep = np.clip((xn - east_sh) / 0.35, 0, 1)
    deep_w = np.clip((west_sh - xn) / 0.18, 0, 1)
    depth = np.maximum(deep, deep_w * 0.6)
    shallow_col = np.array([0.16, 0.44, 0.52])
    deep_col = np.array([0.03, 0.15, 0.33])
    water_rgb = shallow_col[None, None, :] * (1 - depth[..., None]) + deep_col[None, None, :] * depth[..., None]
    water_rgb += (n_fine[..., None] - 0.5) * 0.03
    img[~land] = water_rgb[~land]

    # --- land: warm tan/olive with variation ---
    base_land = np.array([0.55, 0.52, 0.42])
    land_rgb = base_land[None, None, :] + (n_fine[..., None] - 0.5) * np.array([0.10, 0.09, 0.08])[None, None, :]
    land_rgb += (n_coast[..., None] - 0.5) * 0.04
    img[land] = land_rgb[land]

    # --- parks / green space: random blobs on land ---
    green = np.array([0.30, 0.45, 0.26])
    for _ in range(70):
        cx, cy = random.random(), random.random()
        r = random.uniform(0.006, 0.03)
        d = np.sqrt((xn - cx) ** 2 + (np.broadcast_to(ys, (h, w)) - cy) ** 2)
        blob = (d < r * (0.7 + 0.6 * n_fine)) & land
        img[blob] = green[None, None, :] + (n_fine[blob][:, None] - 0.5) * 0.05

    # --- sandy beach rim on the west (gulf) side ---
    beach = np.array([0.82, 0.76, 0.60])
    edge = land & ~np.roll(land, 6, axis=1)          # west-facing shoreline band
    img[edge] = beach

    img = np.clip(img, 0, 1)
    pil = Image.fromarray((img * 255).astype(np.uint8), "RGB")

    # --- street grid, drawn in image space ---
    draw = ImageDraw.Draw(pil, "RGBA")

    def deg_to_px(lo: float, la: float) -> tuple[float, float]:
        return ((lo - WEST) / (EAST - WEST) * w, (NORTH - la) / (NORTH - SOUTH) * h)

    # coarse arterial grid ~800 m
    step = 0.0075
    lo = math.floor(WEST / step) * step
    while lo < EAST:
        x0, _ = deg_to_px(lo, NORTH)
        draw.line([(x0, 0), (x0, h)], fill=(60, 60, 66, 55), width=2)
        lo += step
    la = math.floor(SOUTH / step) * step
    while la < NORTH:
        _, y0 = deg_to_px(WEST, la)
        draw.line([(0, y0), (w, y0)], fill=(60, 60, 66, 55), width=2)
        la += step

    # denser downtown grid ~150 m within ~2.5 km of the core
    dt = 0.0016
    lo = CORE_LON - 0.03
    while lo < CORE_LON + 0.03:
        x0, y0 = deg_to_px(lo, CORE_LAT + 0.025)
        _, y1 = deg_to_px(lo, CORE_LAT - 0.025)
        draw.line([(x0, y0), (x0, y1)], fill=(70, 70, 76, 40), width=1)
        lo += dt
    la = CORE_LAT - 0.025
    while la < CORE_LAT + 0.025:
        x0, y0 = deg_to_px(CORE_LON - 0.03, la)
        x1, _ = deg_to_px(CORE_LON + 0.03, la)
        draw.line([(x0, y0), (x1, y0)], fill=(70, 70, 76, 40), width=1)
        la += dt

    # downtown asphalt tint
    cx, cy = deg_to_px(CORE_LON, CORE_LAT)
    rr = (0.02 / (EAST - WEST)) * w
    draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(90, 90, 96, 45))

    # subtle vignette
    vig = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-w * 0.2, -h * 0.2, w * 1.2, h * 1.2], fill=255)
    vig = vig.point(lambda p: int(p * 0.85 + 30))
    dark = Image.new("RGB", (w, h), (8, 10, 16))
    pil = Image.composite(pil, dark, vig)

    out = BASEMAP_DIR / "stpete-basemap.png"
    pil.save(out, optimize=True)
    (BASEMAP_DIR / "stpete-basemap.json").write_text(json.dumps({
        "note": "STAND-IN asset, not real imagery. Replace with real tiles later.",
        "boundsWGS84": {"west": WEST, "south": SOUTH, "east": EAST, "north": NORTH},
        "pixels": px,
        "core": {"lon": CORE_LON, "lat": CORE_LAT},
    }, indent=2) + "\n")
    print(f"wrote {out} ({out.stat().st_size // 1024} KiB)")


def make_world_fallback(w: int = 1024, h: int = 512) -> None:
    ys = np.linspace(-1, 1, h)[:, None]
    band = np.abs(ys)
    top = np.array([0.04, 0.12, 0.26])
    eq = np.array([0.07, 0.20, 0.36])
    rgb = eq[None, None, :] * (1 - band[..., None]) + top[None, None, :] * band[..., None]
    rgb = rgb + (value_noise(h, w, 4, 3)[..., None] - 0.5) * 0.02
    rgb = np.broadcast_to(rgb, (h, w, 3))
    Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB").save(
        BASEMAP_DIR / "world-fallback.png", optimize=True)
    print(f"wrote {BASEMAP_DIR / 'world-fallback.png'}")


# --------------------------------------------------------------------------- #
# buildings
# --------------------------------------------------------------------------- #
def make_buildings() -> None:
    # Only place footprints on land near downtown / the near-north neighborhoods.
    b_w, b_s, b_e, b_n = -82.670, 27.740, -82.612, 27.802
    block = 0.0016                       # ~150 m blocks
    gap_block = 0.00030                  # street width
    features: list[dict] = []

    def hkm(lon: float, lat: float) -> float:
        # crude local distance from core in km
        dx = (lon - CORE_LON) * 111.32 * math.cos(math.radians(lat))
        dy = (lat - CORE_LAT) * 110.57
        return math.hypot(dx, dy)

    lat = b_s
    while lat < b_n:
        lon = b_w
        while lon < b_e:
            bx0, by0 = lon + gap_block, lat + gap_block
            bx1, by1 = lon + block - gap_block, lat + block - gap_block
            d = hkm((bx0 + bx1) / 2, (by0 + by1) / 2)

            # skip some blocks (parks, water, vacant) — more skipping farther out
            skip_p = 0.10 + min(0.5, d * 0.06)
            if random.random() < skip_p:
                lon += block
                continue

            # subdivide the block into 1..3 x 1..3 lots
            nx = random.choice([1, 1, 2, 2, 3])
            ny = random.choice([1, 1, 2, 2, 3])
            for ix in range(nx):
                for iy in range(ny):
                    inset = 0.00012
                    lx0 = bx0 + ix * (bx1 - bx0) / nx + inset
                    lx1 = bx0 + (ix + 1) * (bx1 - bx0) / nx - inset
                    ly0 = by0 + iy * (by1 - by0) / ny + inset
                    ly1 = by0 + (iy + 1) * (by1 - by0) / ny - inset
                    if lx1 <= lx0 or ly1 <= ly0:
                        continue
                    if random.random() < 0.15:
                        continue

                    if d < 0.8:
                        height = random.choice([
                            random.uniform(45, 95), random.uniform(60, 130),
                            random.uniform(18, 40), random.uniform(25, 55),
                        ])
                    elif d < 2.0:
                        height = random.uniform(10, 34) * (1.0 + (random.random() < 0.08) * 2.0)
                    else:
                        height = random.uniform(5, 12) * (1.0 + (random.random() < 0.04) * 3.0)
                    height = round(height, 1)

                    features.append({
                        "type": "Feature",
                        "properties": {"height": height, "baseHeight": 0.0},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[
                                [round(lx0, 7), round(ly0, 7)],
                                [round(lx1, 7), round(ly0, 7)],
                                [round(lx1, 7), round(ly1, 7)],
                                [round(lx0, 7), round(ly1, 7)],
                                [round(lx0, 7), round(ly0, 7)],
                            ]],
                        },
                    })
            lon += block
        lat += block

    # a few named waterfront "landmarks"
    landmarks = [
        ("Stand-in Tower A", -82.6335, 27.7690, 118),
        ("Stand-in Tower B", -82.6360, 27.7735, 96),
        ("Stand-in Tower C", -82.6395, 27.7702, 134),
        ("Stand-in Civic Hall", -82.6420, 27.7688, 42),
    ]
    for name, lo, la, ht in landmarks:
        dd = 0.00045
        features.append({
            "type": "Feature",
            "properties": {"height": float(ht), "baseHeight": 0.0, "name": name},
            "geometry": {"type": "Polygon", "coordinates": [[
                [lo - dd, la - dd], [lo + dd, la - dd],
                [lo + dd, la + dd], [lo - dd, la + dd], [lo - dd, la - dd],
            ]]},
        })

    fc = {
        "type": "FeatureCollection",
        "name": "stpete-buildings-standin",
        "note": "STAND-IN procedural footprints, not real OSM/LiDAR data.",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    out = BUILD_DIR / "stpete-buildings.geojson"
    out.write_text(json.dumps(fc))
    print(f"wrote {out} ({len(features)} footprints, {out.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    make_basemap()
    make_world_fallback()
    make_buildings()
    print("done.")
