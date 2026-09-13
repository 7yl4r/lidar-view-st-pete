import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  type GeometryAttributes,
  GeometryInstance,
  PerInstanceColorAppearance,
  PrimitiveType,
  Primitive,
  Viewer,
} from "cesium";
import { computeHeightFrame, exaggeratedPosition } from "./exaggeration";
import { TERRAIN } from "../scene/sceneConfig";
import { asset } from "../util/assets";
import type { LayerHandle } from "./types";

interface GridMeta {
  bbox: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  min: number;
  max: number;
}

/** Quads per side of the visualization mesh — a coarser draw-friendly resample
 * of the full-resolution `dem_grid.bin` used for the terrain heightfield. */
const MESH_RES = 110;
/** Metres above the (exaggerated) terrain surface, to avoid z-fighting with the
 * real terrain patch baked from the same data (see terrain.ts). */
const SURFACE_LIFT_M = 2;

/** Classic low-to-high DEM ramp: blue -> green -> yellow -> red. */
function elevationColor(h: number, min: number, max: number): Color {
  const t = max > min ? Math.min(1, Math.max(0, (h - min) / (max - min))) : 0;
  return Color.fromHsl(0.66 - 0.66 * t, 0.8, 0.5, 0.75);
}

const scratchEdge1 = new Cartesian3();
const scratchEdge2 = new Cartesian3();
const scratchNormal = new Cartesian3();

/** Outward-facing (away from Earth's centre) normal for the p0-p1-p3 triangle. */
function faceNormal(p0: Cartesian3, p1: Cartesian3, p3: Cartesian3): Cartesian3 {
  Cartesian3.subtract(p1, p0, scratchEdge1);
  Cartesian3.subtract(p3, p0, scratchEdge2);
  const n = Cartesian3.cross(scratchEdge1, scratchEdge2, scratchNormal);
  // A degenerate (near-zero-area) quad would make `n` the zero vector, and
  // Cartesian3.normalize throws on that -- fall back to the geodetic "up"
  // direction at this vertex instead (always safe: p0 is never near Earth's
  // centre).
  if (Cartesian3.magnitudeSquared(n) < 1e-6) {
    return Cartesian3.normalize(p0, n);
  }
  Cartesian3.normalize(n, n);
  if (Cartesian3.dot(n, p0) < 0) Cartesian3.negate(n, n);
  return n;
}

/**
 * One quad (two triangles) with a flat per-face normal so the lit
 * (`flat: false`) appearance actually shades each facet — without a normal
 * attribute every facet is a uniform unlit colour and the relief this layer
 * exists to show reads as a flat painted plane, not a surface.
 */
function quadGeometry(corners: Cartesian3[]): Geometry {
  const n = faceNormal(corners[0], corners[1], corners[3]);
  const positions = new Float64Array(12);
  const normals = new Float32Array(12);
  for (let k = 0; k < 4; k++) {
    positions[k * 3] = corners[k].x;
    positions[k * 3 + 1] = corners[k].y;
    positions[k * 3 + 2] = corners[k].z;
    normals[k * 3] = n.x;
    normals[k * 3 + 1] = n.y;
    normals[k * 3 + 2] = n.z;
  }
  return new Geometry({
    attributes: {
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      normal: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: normals,
      }),
    } as GeometryAttributes,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(Array.from(positions)),
  });
}

export interface DemSurfaceHandle extends LayerHandle {
  /** Rebuild the mesh at a new vertical exaggeration (tracks the slider). */
  setExaggeration: (scale: number) => void;
}

function buildPrimitive(
  meta: GridMeta,
  grid: Float32Array,
  exaggeration: number,
): Primitive {
  const { west, south, east, north } = meta.bbox;
  const w = meta.width;
  const h = meta.height;

  // Bilinear, not nearest-neighbour: this mesh's own posts are ~27 m apart
  // (MESH_RES=110 across a ~3 km patch), far coarser than the source grid's
  // ~2 m. Nearest-neighbour snapping to that coarse post spacing introduced a
  // real (not artificial) elevation error of up to a metre or more at most
  // locations -- fixed, so it didn't matter at low exaggeration, but grew
  // linearly with the slider since this surface's height is `v * exaggeration`.
  // That's what made ground-truth points drift away from this surface as
  // exaggeration increased, even after removing the old relief-boost mismatch.
  const sample = (fx: number, fy: number): number => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
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

  // Exact position via the SAME shared method pointCloudLayer.ts uses --
  // see exaggeration.ts. `v` (real, unexaggerated metres) is what's shared;
  // an earlier version scaled `v * exaggeration` inline here and, separately,
  // approximated the point cloud's scaling with a per-tile transform matrix.
  // Those were two different methods that were never guaranteed to agree --
  // this is the fix: one function, called by both layers.
  const cornerPosition = (
    lonDeg: number,
    latDeg: number,
    fx: number,
    fy: number,
  ): Cartesian3 => {
    const v = sample(fx, fy);
    return exaggeratedPosition(
      computeHeightFrame(lonDeg, latDeg),
      v,
      exaggeration,
      SURFACE_LIFT_M,
    );
  };

  const instances: GeometryInstance[] = [];
  for (let j = 0; j < MESH_RES; j++) {
    const lat0 = north - ((north - south) * j) / MESH_RES;
    const lat1 = north - ((north - south) * (j + 1)) / MESH_RES;
    const fy0 = (j / MESH_RES) * (h - 1);
    const fy1 = ((j + 1) / MESH_RES) * (h - 1);
    for (let i = 0; i < MESH_RES; i++) {
      const lon0 = west + ((east - west) * i) / MESH_RES;
      const lon1 = west + ((east - west) * (i + 1)) / MESH_RES;
      const fx0 = (i / MESH_RES) * (w - 1);
      const fx1 = ((i + 1) / MESH_RES) * (w - 1);

      const corners = [
        cornerPosition(lon0, lat0, fx0, fy0),
        cornerPosition(lon1, lat0, fx1, fy0),
        cornerPosition(lon1, lat1, fx1, fy1),
        cornerPosition(lon0, lat1, fx0, fy1),
      ];

      const avgV =
        (sample(fx0, fy0) + sample(fx1, fy0) + sample(fx1, fy1) + sample(fx0, fy1)) / 4;

      instances.push(
        new GeometryInstance({
          geometry: quadGeometry(corners),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              elevationColor(avgV, meta.min, meta.max),
            ),
          },
        }),
      );
    }
  }

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ flat: false, translucent: true }),
    releaseGeometryInstances: true,
    // Raw custom Geometry (not one of Cesium's built-in types) has no
    // registered web worker, so it can't go through the async geometry
    // pipeline -- must be processed synchronously.
    asynchronous: false,
  });
}

/**
 * Visible, toggleable draped surface for the real USGS DEM patch baked by
 * `scripts/bake_dem_terrain.py` (see `terrain.ts`, which blends the same data
 * into the terrain heightfield itself). This layer exists purely so the real
 * data is *visible and switchable* the way the LiDAR point cloud used to be:
 * a faceted, elevation-ramp-coloured, per-facet-lit mesh floating a constant
 * `SURFACE_LIFT_M` above the ground.
 *
 * Height = terrain height, `v * exaggeration` -- the same scaling the real
 * terrain and the point cloud use (see pointCloudLayer.ts) -- plus that fixed
 * lift, so this layer, the terrain, and the point cloud all move together at
 * any exaggeration instead of drifting apart. `setExaggeration` rebuilds the
 * mesh (there's no cheap way to update baked vertex heights on an existing
 * `Primitive`), which is fine at this size (~12k quads, well under a frame at
 * typical exaggeration-slider change rates).
 */
export async function addDemSurface(
  viewer: Viewer,
  initialExaggeration: number,
): Promise<DemSurfaceHandle | null> {
  let meta: GridMeta;
  let grid: Float32Array;
  try {
    meta = (await (await fetch(asset(TERRAIN.demMetaUrl))).json()) as GridMeta;
    const buf = await (await fetch(asset(TERRAIN.demGridUrl))).arrayBuffer();
    grid = new Float32Array(buf);
  } catch (err) {
    console.warn("DEM surface layer not available:", err);
    return null;
  }

  let exaggeration = initialExaggeration;
  let visible = true;
  let primitive = buildPrimitive(meta, grid, exaggeration);
  viewer.scene.primitives.add(primitive);

  return {
    id: "dem",
    label: "DEM surface (USGS 3DEP, real data)",
    setVisible: (v) => {
      visible = v;
      primitive.show = visible;
    },
    setExaggeration: (scale) => {
      if (scale === exaggeration) return;
      exaggeration = scale;
      viewer.scene.primitives.remove(primitive);
      primitive = buildPrimitive(meta, grid, exaggeration);
      primitive.show = visible;
      viewer.scene.primitives.add(primitive);
    },
  };
}
