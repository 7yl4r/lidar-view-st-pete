import { Color, Ion, Viewer } from "cesium";
import { createTerrainProvider } from "../layers/terrain";

/**
 * Create a bare CesiumJS Viewer with every default network dependency removed.
 *
 * - `Ion.defaultAccessToken` is blanked: any accidental Cesium ion call fails
 *   fast instead of silently reaching out to a third-party service.
 * - `baseLayer: false`: no default Bing/ion imagery; layers are added explicitly.
 * - Engine assets (Workers, shaders, widgets) are bundled locally by
 *   `vite-plugin-cesium`.
 */
export function createViewer(container: HTMLElement): Viewer {
  Ion.defaultAccessToken = "";

  const viewer = new Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: true,
    selectionIndicator: false,
    infoBox: false,
    terrainProvider: createTerrainProvider(),
    contextOptions: {
      webgl: { powerPreference: "high-performance" },
    },
  });

  // Cesium stamps a "no ion token" credit + its own logo; keep the logo, drop noise.
  viewer.cesiumWidget.creditContainer.setAttribute("style", "display:none");

  const { scene } = viewer;
  scene.globe.baseColor = Color.fromCssColorString("#0b1a2b");
  scene.globe.showGroundAtmosphere = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 1.5;
  scene.screenSpaceCameraController.enableCollisionDetection = true;

  return viewer;
}
