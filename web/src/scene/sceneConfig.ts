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
 * General geographic extent of the area of interest (roughly the St.
 * Petersburg / Pinellas peninsula with Tampa Bay to the east), used to
 * sanity-check bookmark placement.
 */
export const SCENE_BOUNDS = {
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
    id: "dem",
    label: "Real terrain (USGS DEM)",
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
  { id: "dem", label: "DEM surface (USGS 3DEP, real data)", defaultVisible: true },
];

/**
 * Terrain: a metro-wide stand-in heightfield baked by `scripts/bake_terrain.py`,
 * with a real high-resolution patch — from local USGS DEM GeoTIFFs, baked by
 * `scripts/bake_dem_terrain.py` — blended in over the downtown/waterfront AOI.
 */
export const TERRAIN = {
  mode: "baked" as "baked" | "flat",
  gridUrl: "assets/terrain/grid.bin",
  metaUrl: "assets/terrain/grid.json",
  demGridUrl: "assets/terrain/dem_grid.bin",
  demMetaUrl: "assets/terrain/dem_grid.json",
  /** stop refining above this geographic tile level (grid post spacing ~40 m) */
  maxLevel: 15,
};

/** Vertical exaggeration — St. Petersburg has very little natural relief. */
export const EXAGGERATION = {
  default: 3,
  min: 1,
  max: 40,
  /** height below which exaggeration is not applied, keeps sea level put */
  relativeHeight: 0,
};
