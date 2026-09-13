import {
  Appearance,
  BoundingSphere,
  Cartesian3,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  type GeometryAttributes,
  GeometryInstance,
  Primitive,
  PrimitiveType,
  Viewer,
} from "cesium";
import { computeHeightFrame, exaggeratedPosition, type HeightFrame } from "./exaggeration";
import { POINTCLOUD } from "../scene/sceneConfig";
import { asset } from "../util/assets";
import type { LayerHandle } from "./types";

export interface PointCloudHandle extends LayerHandle {
  /** Rebuild at a new vertical exaggeration (tracks the slider). */
  setExaggeration: (scale: number) => void;
}

const POINT_SIZE_PX = 2.0;

// Modeled directly on Cesium's own PerInstanceFlatColorAppearance shaders
// (position3DHigh/Low + czm_computePosition, out_FragColor + czm_gammaCorrect)
// -- the only difference is a real per-vertex `color` here instead of one
// color per geometry instance, since we have millions of individually
// classified points in a single instance, and PerInstanceColorAppearance only
// supports one color for the whole instance.
const VERTEX_SHADER = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 color;
in float batchId;
out vec3 v_color;
void main()
{
    vec4 p = czm_computePosition();
    v_color = color;
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
    gl_PointSize = ${POINT_SIZE_PX.toFixed(1)};
}
`;

const FRAGMENT_SHADER = `
in vec3 v_color;
void main()
{
    out_FragColor = czm_gammaCorrect(vec4(v_color, 1.0));
}
`;

interface PointCloudData {
  lon: Float64Array;
  lat: Float64Array;
  /** Real (unexaggerated) height above the ellipsoid, metres. */
  height: Float32Array;
  rgb: Uint8Array;
}

async function loadPointCloud(): Promise<PointCloudData | null> {
  try {
    const meta = (await (await fetch(asset(POINTCLOUD.metaUrl))).json()) as {
      pointCount: number;
    };
    const buf = await (await fetch(asset(POINTCLOUD.binUrl))).arrayBuffer();
    const n = meta.pointCount;
    return {
      lon: new Float64Array(buf, 0, n),
      lat: new Float64Array(buf, n * 8, n),
      height: new Float32Array(buf, n * 16, n),
      rgb: new Uint8Array(buf, n * 20, n * 3),
    };
  } catch (err) {
    console.warn("point cloud not available:", err);
    return null;
  }
}

/**
 * Each point's (surface, normal) height-frame (see exaggeration.ts),
 * precomputed once at load and reused for every future exaggeration change --
 * the expensive ellipsoid conversion happens once per point ever, not once
 * per point per slider move.
 */
function computeFrames(data: PointCloudData): { surface: Float64Array; normal: Float32Array } {
  const n = data.lon.length;
  const surface = new Float64Array(n * 3);
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const frame = computeHeightFrame(data.lon[i], data.lat[i]);
    surface[i * 3] = frame.surface.x;
    surface[i * 3 + 1] = frame.surface.y;
    surface[i * 3 + 2] = frame.surface.z;
    normal[i * 3] = frame.normal.x;
    normal[i * 3 + 1] = frame.normal.y;
    normal[i * 3 + 2] = frame.normal.z;
  }
  return { surface, normal };
}

const scratchFrame: HeightFrame = { surface: new Cartesian3(), normal: new Cartesian3() };
const scratchPosition = new Cartesian3();

function buildPrimitive(
  data: PointCloudData,
  surface: Float64Array,
  normal: Float32Array,
  exaggeration: number,
): Primitive {
  const n = data.lon.length;
  const positions = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    scratchFrame.surface.x = surface[i * 3];
    scratchFrame.surface.y = surface[i * 3 + 1];
    scratchFrame.surface.z = surface[i * 3 + 2];
    scratchFrame.normal.x = normal[i * 3];
    scratchFrame.normal.y = normal[i * 3 + 1];
    scratchFrame.normal.z = normal[i * 3 + 2];
    exaggeratedPosition(scratchFrame, data.height[i], exaggeration, 0, scratchPosition);
    positions[i * 3] = scratchPosition.x;
    positions[i * 3 + 1] = scratchPosition.y;
    positions[i * 3 + 2] = scratchPosition.z;
  }

  const geometry = new Geometry({
    attributes: {
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      color: new GeometryAttribute({
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 3,
        normalize: true,
        values: data.rgb,
      }),
    } as GeometryAttributes,
    primitiveType: PrimitiveType.POINTS,
    boundingSphere: BoundingSphere.fromVertices(positions as unknown as number[]),
  });

  return new Primitive({
    geometryInstances: new GeometryInstance({ geometry }),
    appearance: new Appearance({
      vertexShaderSource: VERTEX_SHADER,
      fragmentShaderSource: FRAGMENT_SHADER,
      translucent: false,
      // Appearance's own getRenderState() mutates whatever renderState it's
      // given (setting depthMask etc.) -- it must be a real object, unlike
      // the other options here, which fall back to sane defaults when
      // omitted. This matches what Appearance.getDefaultRenderState(false,
      // false) produces internally (not exposed in the public TS types).
      renderState: { depthTest: { enabled: true }, depthMask: true },
    }),
    releaseGeometryInstances: true,
    // Raw custom Geometry (not one of Cesium's built-in types) has no
    // registered web worker, so it can't go through the async geometry
    // pipeline -- must be processed synchronously.
    asynchronous: false,
  });
}

/**
 * Real LiDAR: a self-hosted point cloud baked by `scripts/bake_pointcloud.py`
 * from local USGS 3DEP LPC `.laz` tiles (see README "Data" -- not fetched at
 * build time, and not committed). Points are pre-coloured by ASPRS
 * classification (ground / building / water / vegetation).
 *
 * Rendered as a plain point-primitive `Primitive` rather than a
 * `Cesium3DTileset`, deliberately: Cesium's legacy `.pnts` point-cloud
 * renderer has no support at all for `scene.verticalExaggeration` (only the
 * newer glTF/`Model` pipeline does), which is what previously forced an
 * approximate per-tile transform-matrix workaround here that could never
 * exactly agree with `demLayer.ts`'s exact per-vertex scaling. This layer
 * instead builds each point's position from the exact same shared method
 * (`exaggeration.ts`) demLayer.ts uses, so the two always agree by
 * construction. The trade-off: no 3D Tiles streaming/LOD and no
 * eye-dome-lighting/attenuation shading -- acceptable at this point budget
 * (~2-3M, fixed, no LOD needed).
 *
 * Returns null (not an error) if the data hasn't been generated yet.
 */
export async function addPointCloud(
  viewer: Viewer,
  initialExaggeration: number,
): Promise<PointCloudHandle | null> {
  const data = await loadPointCloud();
  if (!data) return null;

  const { surface, normal } = computeFrames(data);

  let exaggeration = initialExaggeration;
  let builtExaggeration = exaggeration;
  let visible = true;
  let primitive = buildPrimitive(data, surface, normal, exaggeration);
  viewer.scene.primitives.add(primitive);

  // Rebuilding is O(point count) -- at ~2.4M points, a few seconds, unlike
  // demLayer.ts's ~12k-quad rebuild. The exaggeration slider fires on every
  // step while being dragged, so rebuilding on every call would compound
  // into a multi-second freeze per drag; debounce so only the value the user
  // settles on triggers a rebuild.
  const REBUILD_DEBOUNCE_MS = 200;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = (): void => {
    debounceTimer = undefined;
    if (exaggeration === builtExaggeration) return;
    builtExaggeration = exaggeration;
    viewer.scene.primitives.remove(primitive);
    primitive = buildPrimitive(data, surface, normal, exaggeration);
    primitive.show = visible;
    viewer.scene.primitives.add(primitive);
  };

  return {
    id: "pointcloud",
    label: "LiDAR point cloud (USGS 3DEP, real data)",
    setVisible: (v) => {
      visible = v;
      primitive.show = visible;
    },
    setExaggeration: (scale) => {
      exaggeration = scale;
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
    },
  };
}
