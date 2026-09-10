import { create } from "zustand";
import type { SceneController, SceneStats } from "../engine/SceneController";
import { EXAGGERATION, LAYERS, type QualityPreset } from "../scene/sceneConfig";

interface LayerUiState {
  id: string;
  label: string;
  visible: boolean;
}

interface AppState {
  controller: SceneController | null;
  ready: boolean;
  error: string | null;
  stats: SceneStats;
  layers: LayerUiState[];
  activeBookmark: string;
  quality: QualityPreset;
  exaggeration: number;

  bindController: (c: SceneController) => void;
  setReady: (v: boolean) => void;
  setError: (msg: string) => void;
  setStats: (s: SceneStats) => void;
  toggleLayer: (id: string) => void;
  flyTo: (bookmarkId: string) => void;
  setQuality: (p: QualityPreset) => void;
  setExaggeration: (scale: number) => void;
}

export const useStore = create<AppState>((set, get) => ({
  controller: null,
  ready: false,
  error: null,
  stats: { fps: 0, cameraHeightM: 0, lon: 0, lat: 0 },
  layers: LAYERS.map((l) => ({
    id: l.id,
    label: l.label,
    visible: l.defaultVisible,
  })),
  activeBookmark: "overview",
  quality: "workstation",
  exaggeration: EXAGGERATION.default,

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
  },

  flyTo: (bookmarkId) => {
    get().controller?.flyTo(bookmarkId);
    set({ activeBookmark: bookmarkId });
  },

  setQuality: (p) => {
    get().controller?.setQuality(p);
    set({ quality: p });
  },

  setExaggeration: (scale) => {
    get().controller?.setVerticalExaggeration(scale);
    set({ exaggeration: scale });
  },
}));
