import { EllipsoidTerrainProvider, type TerrainProvider } from "cesium";

/**
 * Stand-in terrain: a flat ellipsoid. St. Petersburg is near sea level and very
 * flat, so this reads fine for Phase 0.
 *
 * Swap path (Phase 0 of the separate data project): publish Cesium
 * quantized-mesh tiles to `/assets/terrain/` and replace the body with:
 *
 *   return await CesiumTerrainProvider.fromUrl("/assets/terrain", {
 *     requestVertexNormals: true,
 *   });
 */
export function createTerrainProvider(): TerrainProvider {
  return new EllipsoidTerrainProvider();
}
