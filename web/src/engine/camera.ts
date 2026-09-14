import { Cartesian3, Math as CesiumMath, Viewer } from "cesium";

/** WGS84 camera position + orientation, degrees and metres throughout. */
export interface CameraPose {
  lon: number;
  lat: number;
  /** camera height above the ellipsoid, metres */
  height: number;
  heading: number;
  /** degrees, negative looks down */
  pitch: number;
}

/** Fly the camera to a pose. `duration` in seconds (0 = jump). */
export function flyToCamera(
  viewer: Viewer,
  pose: CameraPose,
  duration = 2.0,
): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(pose.lon, pose.lat, pose.height),
    orientation: {
      heading: CesiumMath.toRadians(pose.heading),
      pitch: CesiumMath.toRadians(pose.pitch),
      roll: 0,
    },
    duration,
  });
}

/** Read the camera's current pose back out, e.g. for URL sync. */
export function getCameraPose(viewer: Viewer): CameraPose {
  const { camera } = viewer;
  const carto = camera.positionCartographic;
  return {
    lon: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
    height: carto.height,
    heading: CesiumMath.toDegrees(camera.heading),
    pitch: CesiumMath.toDegrees(camera.pitch),
  };
}
