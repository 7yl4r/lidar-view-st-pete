import { Color, Entity, Rectangle, Viewer } from "cesium";
import type { LayerHandle } from "./types";

/**
 * Stand-in static sea surface: translucent rectangles over Tampa Bay and the
 * Boca Ciega / gulf side, at ellipsoid height ~0.
 *
 * This is a placeholder for the headline capability. Real, time-varying water
 * surfaces (sea-level-rise scenarios, surge) arrive from the modeling pipeline
 * as meshes / 3D Tiles / height rasters and are driven by the scene clock in
 * Phase 2–3.
 */
export function addWater(viewer: Viewer): LayerHandle {
  const material = new Color(0.09, 0.32, 0.46, 0.5);
  const mk = (west: number, south: number, east: number, north: number): Entity =>
    viewer.entities.add({
      rectangle: {
        coordinates: Rectangle.fromDegrees(west, south, east, north),
        height: 0.3,
        material,
      },
    });

  // Edges follow the stand-in basemap's land mask (land spans lon ~-82.734..-82.642)
  // so the surface reads as bays flanking the peninsula, not a flooded city.
  const parts = [
    mk(-82.642, 27.62, -82.53, 27.88), // Tampa Bay (east)
    mk(-82.8, 27.62, -82.734, 27.88), // Boca Ciega / gulf (west)
  ];

  return {
    id: "water",
    label: "Sea level (stand-in)",
    setVisible: (visible) => {
      for (const p of parts) p.show = visible;
    },
  };
}
