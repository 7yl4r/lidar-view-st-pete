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
import { asset } from "../util/assets";
import type { LayerHandle } from "./types";

interface BuildingFeature {
  properties: { height?: number; baseHeight?: number; name?: string };
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

/**
 * Stand-in city buildings: procedural extruded footprints batched into a single
 * `Primitive` for throughput.
 *
 * Swap path: replace with a self-hosted 3D Tiles set —
 *   const ts = await Cesium3DTileset.fromUrl("/assets/buildings/tileset.json");
 *   viewer.scene.primitives.add(ts);
 */
export async function addBuildings(viewer: Viewer): Promise<LayerHandle> {
  const res = await fetch(asset("assets/buildings/stpete-buildings.geojson"));
  if (!res.ok) throw new Error(`buildings geojson ${res.status}`);
  const fc = (await res.json()) as BuildingCollection;

  const instances: GeometryInstance[] = [];
  for (const f of fc.features) {
    const ring = f.geometry.coordinates[0];
    if (!ring || ring.length < 4) continue;
    // drop the closing vertex; Cartesian3.fromDegreesArray wants a flat list
    const flat: number[] = [];
    for (let i = 0; i < ring.length - 1; i++) flat.push(ring[i][0], ring[i][1]);

    const height = f.properties.height ?? 10;
    const base = f.properties.baseHeight ?? 0;

    instances.push(
      new GeometryInstance({
        geometry: new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(
            Cartesian3.fromDegreesArray(flat),
          ),
          height: base,
          extrudedHeight: base + height,
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

  const primitive = new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({
      flat: false,
      translucent: false,
    }),
    releaseGeometryInstances: true,
    asynchronous: true,
  });
  viewer.scene.primitives.add(primitive);

  return {
    id: "buildings",
    label: `Buildings (stand-in, ${instances.length})`,
    setVisible: (visible) => {
      primitive.show = visible;
    },
  };
}
