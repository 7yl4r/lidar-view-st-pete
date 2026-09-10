/**
 * Static scene configuration for the Phase 0 demo.
 *
 * In Phase 1 this is replaced by a fetched `scene.json` manifest (see
 * IMPLEMENTATION_PLAN.md §1). For now the values live here so they are easy to
 * unit-test and edit.
 */

export interface Bookmark {
  id: string;
  label: string;
  /** WGS84 degrees */
  lon: number;
  lat: number;
  /** camera height above the ellipsoid, metres */
  height: number;
  /** degrees */
  heading: number;
  /** degrees, negative looks down */
  pitch: number;
}

export const CITY = {
  name: "St. Petersburg, FL",
  lon: -82.6403,
  lat: 27.7676,
} as const;

/**
 * Geographic extent of the stand-in aerial basemap PNG.
 * MUST match WEST/SOUTH/EAST/NORTH in `scripts/gen_standins.py`.
 */
export const BASEMAP_BOUNDS = {
  west: -82.78,
  south: 27.63,
  east: -82.55,
  north: 27.86,
} as const;

export const BOOKMARKS: Bookmark[] = [
  {
    id: "overview",
    label: "City overview",
    lon: -82.64,
    lat: 27.665,
    height: 9500,
    heading: 0,
    pitch: -38,
  },
  {
    id: "downtown",
    label: "Downtown waterfront",
    lon: -82.6375,
    lat: 27.752,
    height: 1500,
    heading: 22,
    pitch: -26,
  },
  {
    id: "pier",
    label: "The Pier",
    lon: -82.6255,
    lat: 27.767,
    height: 650,
    heading: -72,
    pitch: -16,
  },
  {
    id: "lidar",
    label: "LiDAR block (real data)",
    lon: -82.6375,
    lat: 27.767,
    height: 520,
    heading: 35,
    pitch: -22,
  },
  {
    id: "shoreacres",
    label: "Shore Acres",
    lon: -82.612,
    lat: 27.796,
    height: 1300,
    heading: 205,
    pitch: -24,
  },
  {
    id: "bayapproach",
    label: "Tampa Bay approach",
    lon: -82.595,
    lat: 27.742,
    height: 2600,
    heading: 288,
    pitch: -14,
  },
];

export type QualityPreset = "workstation" | "vizcenter";

export interface QualitySettings {
  label: string;
  resolutionScale: number;
  msaaSamples: number;
  fxaa: boolean;
  /** HDR tone-mapping — only applied where the GPU/driver supports it. */
  hdr: boolean;
}

export const QUALITY: Record<QualityPreset, QualitySettings> = {
  workstation: {
    label: "Workstation",
    resolutionScale: 1,
    msaaSamples: 4,
    fxaa: true,
    hdr: false,
  },
  vizcenter: {
    label: "Viz-Center (max)",
    resolutionScale: 1,
    msaaSamples: 8,
    fxaa: true,
    hdr: true,
  },
};

export interface LayerConfig {
  id: string;
  label: string;
  /** visible on first load */
  defaultVisible: boolean;
}

/** UI layer list — ids must match the handles registered in SceneController. */
export const LAYERS: LayerConfig[] = [
  { id: "basemap", label: "Aerial basemap (stand-in)", defaultVisible: true },
  { id: "pointcloud", label: "LiDAR point cloud (USGS 3DEP 2018)", defaultVisible: true },
  { id: "buildings", label: "Buildings (stand-in)", defaultVisible: false },
  { id: "water", label: "Sea level (stand-in)", defaultVisible: true },
];

/** Terrain: self-hosted heightfield baked by scripts/bake_terrain.py. */
export const TERRAIN = {
  mode: "baked" as "baked" | "flat",
  gridUrl: "assets/terrain/grid.bin",
  metaUrl: "assets/terrain/grid.json",
  /** stop refining above this geographic tile level (grid post spacing ~40 m) */
  maxLevel: 15,
};

/** Vertical exaggeration — St. Petersburg has very little natural relief. */
export const EXAGGERATION = {
  default: 3,
  min: 1,
  max: 12,
  /** height below which exaggeration is not applied, keeps sea level put */
  relativeHeight: 0,
};

/** Real LiDAR point-cloud tileset from scripts/fetch_lidar.py. */
export const POINTCLOUD = {
  tilesetUrl: "assets/pointcloud/tileset.json",
  metaUrl: "assets/pointcloud/meta.json",
};
