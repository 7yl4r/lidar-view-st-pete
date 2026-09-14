import type { CameraPose } from "./camera";

/**
 * Everything needed to reproduce a view: camera pose, vertical exaggeration,
 * and which dataset layers are on. Round-trips through the URL's query
 * string (via `history.replaceState`, so navigating never adds history
 * entries) so a view can be shared just by copying the address bar.
 */
export interface ViewState {
  camera: CameraPose;
  exaggeration: number;
  /** ids of the layers that are currently visible */
  visibleLayers: string[];
}

const PARAM = {
  lon: "lon",
  lat: "lat",
  height: "alt",
  heading: "heading",
  pitch: "pitch",
  exaggeration: "exag",
  layers: "layers",
} as const;

const DECIMALS = {
  lon: 6,
  lat: 6,
  height: 1,
  heading: 1,
  pitch: 1,
  exaggeration: 2,
};

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parses whatever subset of view state is present in the current URL. */
export function readUrlViewState(): Partial<ViewState> {
  const params = new URLSearchParams(window.location.search);
  const state: Partial<ViewState> = {};

  const lon = readNumber(params, PARAM.lon);
  const lat = readNumber(params, PARAM.lat);
  const height = readNumber(params, PARAM.height);
  if (lon !== undefined && lat !== undefined && height !== undefined) {
    state.camera = {
      lon,
      lat,
      height,
      heading: readNumber(params, PARAM.heading) ?? 0,
      pitch: readNumber(params, PARAM.pitch) ?? -30,
    };
  }

  const exaggeration = readNumber(params, PARAM.exaggeration);
  if (exaggeration !== undefined) state.exaggeration = exaggeration;

  const layersRaw = params.get(PARAM.layers);
  if (layersRaw !== null) {
    state.visibleLayers = layersRaw.length ? layersRaw.split(",") : [];
  }

  return state;
}

/** Writes the full view state into the URL, replacing history (no new entry). */
export function writeUrlViewState(state: ViewState): void {
  const params = new URLSearchParams();
  params.set(PARAM.lon, state.camera.lon.toFixed(DECIMALS.lon));
  params.set(PARAM.lat, state.camera.lat.toFixed(DECIMALS.lat));
  params.set(PARAM.height, state.camera.height.toFixed(DECIMALS.height));
  params.set(PARAM.heading, state.camera.heading.toFixed(DECIMALS.heading));
  params.set(PARAM.pitch, state.camera.pitch.toFixed(DECIMALS.pitch));
  params.set(PARAM.exaggeration, state.exaggeration.toFixed(DECIMALS.exaggeration));
  params.set(PARAM.layers, state.visibleLayers.join(","));

  const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}
