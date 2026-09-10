import {
  CustomHeightmapTerrainProvider,
  EllipsoidTerrainProvider,
  GeographicTilingScheme,
  Math as CesiumMath,
  Rectangle,
  type TerrainProvider,
} from "cesium";
import { TERRAIN } from "../scene/sceneConfig";
import { asset } from "../util/assets";

interface GridMeta {
  bbox: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  min: number;
  max: number;
  source: string;
}

const HEIGHTMAP_SIZE = 65;

/** Flat ellipsoid — the fallback / `mode: "flat"`. */
export function createFlatTerrainProvider(): TerrainProvider {
  return new EllipsoidTerrainProvider();
}

/**
 * Real elevation from a self-hosted heightfield grid baked by
 * `scripts/bake_terrain.py` (USGS 3DEP/NED-derived terrarium mosaic). Deliberately
 * low resolution — a stand-in for a LiDAR-derived DTM tileset, swapped later.
 */
export async function createBakedTerrainProvider(): Promise<TerrainProvider> {
  const meta = (await (await fetch(asset(TERRAIN.metaUrl))).json()) as GridMeta;
  const buf = await (await fetch(asset(TERRAIN.gridUrl))).arrayBuffer();
  const grid = new Float32Array(buf);
  if (grid.length !== meta.width * meta.height) {
    throw new Error(
      `terrain grid size ${grid.length} != ${meta.width}x${meta.height}`,
    );
  }

  const { west, south, east, north } = meta.bbox;
  const w = meta.width;
  const h = meta.height;

  const sample = (lonDeg: number, latDeg: number): number => {
    const fx = ((lonDeg - west) / (east - west)) * (w - 1);
    const fy = ((north - latDeg) / (north - south)) * (h - 1); // row 0 = north
    if (fx < 0 || fx > w - 1 || fy < 0 || fy > h - 1) return 0;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = grid[y0 * w + x0];
    const b = grid[y0 * w + x1];
    const c = grid[y1 * w + x0];
    const d = grid[y1 * w + x1];
    return (
      a * (1 - tx) * (1 - ty) +
      b * tx * (1 - ty) +
      c * (1 - tx) * ty +
      d * tx * ty
    );
  };

  const tilingScheme = new GeographicTilingScheme();
  const bbox = Rectangle.fromDegrees(west, south, east, north);

  return new CustomHeightmapTerrainProvider({
    tilingScheme,
    width: HEIGHTMAP_SIZE,
    height: HEIGHTMAP_SIZE,
    callback: (x, y, level) => {
      if (level > TERRAIN.maxLevel) return undefined;
      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      if (!Rectangle.intersection(rect, bbox)) return undefined;

      const out = new Float32Array(HEIGHTMAP_SIZE * HEIGHTMAP_SIZE);
      const wDeg = CesiumMath.toDegrees(rect.west);
      const eDeg = CesiumMath.toDegrees(rect.east);
      const nDeg = CesiumMath.toDegrees(rect.north);
      const sDeg = CesiumMath.toDegrees(rect.south);
      for (let j = 0; j < HEIGHTMAP_SIZE; j++) {
        const lat = nDeg - ((nDeg - sDeg) * j) / (HEIGHTMAP_SIZE - 1);
        for (let i = 0; i < HEIGHTMAP_SIZE; i++) {
          const lon = wDeg + ((eDeg - wDeg) * i) / (HEIGHTMAP_SIZE - 1);
          out[j * HEIGHTMAP_SIZE + i] = sample(lon, lat);
        }
      }
      return out;
    },
  });
}

export async function createTerrainProvider(): Promise<TerrainProvider> {
  if (TERRAIN.mode === "flat") return createFlatTerrainProvider();
  try {
    return await createBakedTerrainProvider();
  } catch (err) {
    console.error("baked terrain failed, falling back to flat:", err);
    return createFlatTerrainProvider();
  }
}
