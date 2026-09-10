import {
  ImageryLayer,
  Rectangle,
  SingleTileImageryProvider,
  Viewer,
} from "cesium";
import { BASEMAP_BOUNDS } from "../scene/sceneConfig";
import { asset } from "../util/assets";
import type { LayerHandle } from "./types";

/**
 * Two stand-in raster layers, both served from our own `/assets`:
 *   1. a low-res global ocean fill so the globe is never blank
 *   2. the stylized St. Petersburg "aerial" clamped to its geographic extent
 *
 * Swap path: replace these with a self-hosted XYZ/WMTS tile set
 * (`UrlTemplateImageryProvider` / `WebMapTileServiceImageryProvider`) once the
 * data project publishes real imagery tiles.
 */
export async function addImagery(viewer: Viewer): Promise<{
  world: ImageryLayer;
  city: ImageryLayer;
  handle: LayerHandle;
}> {
  const layers = viewer.imageryLayers;

  const worldProvider = await SingleTileImageryProvider.fromUrl(
    asset("assets/basemap/world-fallback.png"),
  );
  const world = layers.addImageryProvider(worldProvider);
  world.brightness = 0.9;

  const cityProvider = await SingleTileImageryProvider.fromUrl(
    asset("assets/basemap/stpete-basemap.png"),
    {
      rectangle: Rectangle.fromDegrees(
        BASEMAP_BOUNDS.west,
        BASEMAP_BOUNDS.south,
        BASEMAP_BOUNDS.east,
        BASEMAP_BOUNDS.north,
      ),
    },
  );
  const city = layers.addImageryProvider(cityProvider);

  const handle: LayerHandle = {
    id: "basemap",
    label: "Aerial basemap (stand-in)",
    setVisible: (visible) => {
      city.show = visible;
    },
  };

  return { world, city, handle };
}
