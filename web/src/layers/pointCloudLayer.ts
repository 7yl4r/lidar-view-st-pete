import {
  Cesium3DTileset,
  Cesium3DTileStyle,
  PointCloudShading,
  Viewer,
} from "cesium";
import { POINTCLOUD } from "../scene/sceneConfig";
import { asset } from "../util/assets";
import type { LayerHandle } from "./types";

/**
 * Real LiDAR: a self-hosted 3D Tiles point cloud built by
 * `scripts/bake_pointcloud.py` from local USGS 3DEP LPC `.laz` tiles (see
 * README "Data" -- not fetched at build time, and not committed). Points are
 * pre-coloured by ASPRS classification (ground / building / water /
 * vegetation). One `.pnts` tile per input `.laz` file, no octree LOD within a
 * tile (see the bake script for why).
 *
 * Returns null (not an error) if the tileset hasn't been generated yet.
 */
export async function addPointCloud(
  viewer: Viewer,
): Promise<LayerHandle | null> {
  let tileset: Cesium3DTileset;
  try {
    tileset = await Cesium3DTileset.fromUrl(asset(POINTCLOUD.tilesetUrl), {
      maximumScreenSpaceError: 8,
      cacheBytes: 512 * 1024 * 1024,
    });
  } catch (err) {
    console.warn("point cloud tileset not available:", err);
    return null;
  }

  tileset.style = new Cesium3DTileStyle({ pointSize: 2.0 });
  tileset.pointCloudShading = new PointCloudShading({
    attenuation: true,
    maximumAttenuation: 4,
    eyeDomeLighting: true,
    eyeDomeLightingStrength: 1.0,
    eyeDomeLightingRadius: 1.0,
  });

  viewer.scene.primitives.add(tileset);

  return {
    id: "pointcloud",
    label: "LiDAR point cloud (USGS 3DEP, real data)",
    setVisible: (visible) => {
      tileset.show = visible;
    },
  };
}
