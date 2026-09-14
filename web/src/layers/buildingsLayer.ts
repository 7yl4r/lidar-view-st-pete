import {
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  Viewer,
} from "cesium";
import { BUILDINGS } from "../scene/sceneConfig";
import { asset } from "../util/assets";
import type { LayerHandle } from "./types";

interface BuildingFeature {
  properties: { height?: number; baseHeight?: number };
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

interface BuildingCollection {
  features: BuildingFeature[];
}

/** Height-graded facade colour: warm stone at street level → cool steel up high. */
function colorForHeight(height: number): Color {
  const t = Math.min(1, height / 130);
  return Color.fromHsl(0.6 - 0.06 * t, 0.12 + 0.12 * t, 0.62 - 0.24 * t, 1.0);
}

export interface BuildingsHandle extends LayerHandle {
  /** Rebuild at a new vertical exaggeration (tracks the slider). */
  setExaggeration: (scale: number) => void;
}

function buildPrimitive(fc: BuildingCollection, exaggeration: number): Primitive {
  const instances: GeometryInstance[] = [];
  for (const f of fc.features) {
    const ring = f.geometry.coordinates[0];
    if (!ring || ring.length < 4) continue;
    const flat: number[] = [];
    for (let i = 0; i < ring.length - 1; i++) flat.push(ring[i][0], ring[i][1]);

    const height = f.properties.height ?? 10;
    const base = f.properties.baseHeight ?? 0;

    instances.push(
      new GeometryInstance({
        geometry: new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(flat)),
          // Same `v * exaggeration` convention as every other real-data layer
          // (see exaggeration.ts) -- base and roof are both real, unexaggerated
          // elevations baked by bake_buildings.py.
          height: base * exaggeration,
          extrudedHeight: (base + height) * exaggeration,
          closeTop: true,
          closeBottom: false,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(colorForHeight(height)),
        },
      }),
    );
  }

  return new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ flat: false, translucent: false }),
    releaseGeometryInstances: true,
    // PolygonGeometry is one of Cesium's built-in geometry types (unlike the
    // raw custom Geometry demLayer.ts/pointCloudLayer.ts use), so it has a
    // registered worker and can go through the async pipeline.
    asynchronous: true,
  });
}

/**
 * Real building footprints, estimated from the classified LiDAR point cloud
 * by `scripts/bake_buildings.py` (see README "Data" -- not fetched at build
 * time, and not committed). This is an *estimate*: rasterized and vectorized
 * from where building-classified LiDAR returns land, not a surveyed
 * footprint dataset -- expect rounded corners and occasional merged
 * buildings, not parcel-accurate outlines.
 *
 * Returns null (not an error) if the data hasn't been generated yet.
 */
export async function addBuildings(
  viewer: Viewer,
  initialExaggeration: number,
): Promise<BuildingsHandle | null> {
  let fc: BuildingCollection;
  try {
    const res = await fetch(asset(BUILDINGS.geojsonUrl));
    if (!res.ok) throw new Error(`buildings geojson ${res.status}`);
    fc = (await res.json()) as BuildingCollection;
  } catch (err) {
    console.warn("buildings layer not available:", err);
    return null;
  }

  let exaggeration = initialExaggeration;
  let visible = true;
  let primitive = buildPrimitive(fc, exaggeration);
  viewer.scene.primitives.add(primitive);

  return {
    id: "buildings",
    label: `Buildings (estimated from LiDAR, ${fc.features.length})`,
    setVisible: (v) => {
      visible = v;
      primitive.show = visible;
    },
    setExaggeration: (scale) => {
      if (scale === exaggeration) return;
      exaggeration = scale;
      viewer.scene.primitives.remove(primitive);
      primitive = buildPrimitive(fc, exaggeration);
      primitive.show = visible;
      viewer.scene.primitives.add(primitive);
    },
  };
}
