import { Cartesian3, Ellipsoid } from "cesium";

/**
 * The exact decomposition CesiumJS uses internally for
 * `Cartesian3.fromRadians/fromDegrees(lon, lat, height)`:
 *
 *   position = surface + height * normal
 *
 * where `surface` is the ellipsoid surface point (height 0) and `normal` is
 * the geodetic surface normal at that lon/lat -- both constant regardless of
 * height. Precomputing them once per point lets a later height change (i.e.
 * a new vertical-exaggeration value) be applied as a cheap multiply-add
 * instead of a full ellipsoid conversion, while staying mathematically EXACT
 * for any exaggeration -- not an approximation that drifts with distance the
 * way a single shared transform matrix over an area does.
 *
 * This is the one method every layer that tracks the live vertical
 * exaggeration slider (`demLayer.ts`, `pointCloudLayer.ts`) builds its
 * positions from, so they render off the same ground truth and can't drift
 * apart the way two independently-derived formulas did before.
 */
export interface HeightFrame {
  surface: Cartesian3;
  normal: Cartesian3;
}

export function computeHeightFrame(lonDeg: number, latDeg: number): HeightFrame {
  const surface = Cartesian3.fromDegrees(lonDeg, latDeg, 0);
  const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(surface, new Cartesian3());
  return { surface, normal };
}

/**
 * Position at `realHeightMeters * exaggeration (+ extraLiftMeters)` above the
 * ellipsoid at `frame`'s lon/lat. `extraLiftMeters` is a small constant
 * offset applied *after* exaggeration (not itself exaggerated) -- e.g. to
 * keep a draped visualization surface from z-fighting with the terrain it
 * sits on, at any exaggeration.
 */
export function exaggeratedPosition(
  frame: HeightFrame,
  realHeightMeters: number,
  exaggeration: number,
  extraLiftMeters = 0,
  result: Cartesian3 = new Cartesian3(),
): Cartesian3 {
  const h = realHeightMeters * exaggeration + extraLiftMeters;
  Cartesian3.multiplyByScalar(frame.normal, h, result);
  return Cartesian3.add(frame.surface, result, result);
}
