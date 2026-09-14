import { create } from "zustand";
import type { CameraPose } from "../engine/camera";
import type { SceneController, SceneStats } from "../engine/SceneController";
import { readUrlViewState, writeUrlViewState } from "../engine/urlState";
import { EXAGGERATION, LAYERS, type QualityPreset } from "../scene/sceneConfig";

interface LayerUiState {
  id: string;
  label: string;
  visible: boolean;
}

const urlState = readUrlViewState();

interface AppState {
  controller: SceneController | null;
  ready: boolean;
  error: string | null;
  stats: SceneStats;
  layers: LayerUiState[];
  camera: CameraPose | null;
  quality: QualityPreset;
  exaggeration: number;

  bindController: (c: SceneController) => void;
  setReady: (v: boolean) => void;
  setError: (msg: string) => void;
  setStats: (s: SceneStats) => void;
  toggleLayer: (id: string) => void;
  setCamera: (pose: CameraPose) => void;
  setQuality: (p: QualityPreset) => void;
  setExaggeration: (scale: number) => void;
}

export const useStore = create<AppState>((set, get) => {
  /** Writes the current camera/exaggeration/layers into the URL as one unit,
   * so a copied link reproduces the whole view. Skipped until the camera's
   * first position is known (moments after scene init), a small window that
   * predates any user-triggered exaggeration/layer change in practice. */
  const syncUrl = (): void => {
    const { camera, exaggeration, layers } = get();
    if (!camera) return;
    writeUrlViewState({
      camera,
      exaggeration,
      visibleLayers: layers.filter((l) => l.visible).map((l) => l.id),
    });
  };

  return {
    controller: null,
    ready: false,
    error: null,
    stats: { fps: 0, cameraHeightM: 0, lon: 0, lat: 0 },
    layers: LAYERS.map((l) => ({
      id: l.id,
      label: l.label,
      visible: urlState.visibleLayers
        ? urlState.visibleLayers.includes(l.id)
        : l.defaultVisible,
    })),
    camera: urlState.camera ?? null,
    quality: "workstation",
    exaggeration: urlState.exaggeration ?? EXAGGERATION.default,

    bindController: (c) => set({ controller: c }),
    setReady: (v) => set({ ready: v }),
    setError: (msg) => set({ error: msg }),
    setStats: (s) => set({ stats: s }),

    toggleLayer: (id) => {
      const layers = get().layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l,
      );
      const next = layers.find((l) => l.id === id);
      if (next) get().controller?.setLayerVisible(id, next.visible);
      set({ layers });
      syncUrl();
    },

    setCamera: (pose) => {
      set({ camera: pose });
      syncUrl();
    },

    setQuality: (p) => {
      get().controller?.setQuality(p);
      set({ quality: p });
    },

    setExaggeration: (scale) => {
      get().controller?.setVerticalExaggeration(scale);
      set({ exaggeration: scale });
      syncUrl();
    },
  };
});
