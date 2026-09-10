import { Cartesian3, Math as CesiumMath, Viewer } from "cesium";
import type { Bookmark } from "../scene/sceneConfig";

/** Fly the camera to a named bookmark. `duration` in seconds (0 = jump). */
export function flyToBookmark(
  viewer: Viewer,
  bookmark: Bookmark,
  duration = 2.0,
): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      bookmark.lon,
      bookmark.lat,
      bookmark.height,
    ),
    orientation: {
      heading: CesiumMath.toRadians(bookmark.heading),
      pitch: CesiumMath.toRadians(bookmark.pitch),
      roll: 0,
    },
    duration,
  });
}
