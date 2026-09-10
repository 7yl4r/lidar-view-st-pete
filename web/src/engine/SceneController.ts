import { Math as CesiumMath, Viewer } from "cesium";
import { addBuildings } from "../layers/buildingsLayer";
import { addImagery } from "../layers/imageryLayers";
import { addWater } from "../layers/waterLayer";
import type { LayerHandle } from "../layers/types";
import {
  BOOKMARKS,
  QUALITY,
  type QualityPreset,
} from "../scene/sceneConfig";
import { configureAtmosphere } from "./atmosphere";
import { flyToBookmark } from "./camera";
import { createViewer } from "./createViewer";

export interface SceneStats {
  fps: number;
  cameraHeightM: number;
  lon: number;
  lat: number;
}

const STATS_INTERVAL_MS = 250;

/**
 * Thin renderer facade. The React UI only talks to this class, never to Cesium
 * directly — which is what lets Phase 1+ add layers (and, if ever needed, an
 * alternative renderer) without touching component code.
 */
export class SceneController {
  readonly viewer: Viewer;
  private readonly layers = new Map<string, LayerHandle>();
  private disposed = false;
  private detachStats?: () => void;

  constructor(container: HTMLElement) {
    this.viewer = createViewer(container);
    // Debug handle — useful when diagnosing rendering on viz-center hardware.
    (window as unknown as { __scene?: Viewer }).__scene = this.viewer;
  }

  async init(onStats: (s: SceneStats) => void): Promise<void> {
    const { viewer } = this;
    configureAtmosphere(viewer);
    this.setQuality("workstation");

    const imagery = await addImagery(viewer);
    if (this.disposed) return;
    this.register(imagery.handle);
    this.register(await addBuildings(viewer));
    if (this.disposed) return;
    this.register(addWater(viewer));

    flyToBookmark(viewer, BOOKMARKS[0], 0);

    this.startStatsPump(onStats);
  }

  private register(handle: LayerHandle): void {
    this.layers.set(handle.id, handle);
  }

  layerLabel(id: string): string | undefined {
    return this.layers.get(id)?.label;
  }

  setLayerVisible(id: string, visible: boolean): void {
    this.layers.get(id)?.setVisible(visible);
  }

  flyTo(bookmarkId: string): void {
    const b = BOOKMARKS.find((x) => x.id === bookmarkId);
    if (b) flyToBookmark(this.viewer, b);
  }

  setQuality(preset: QualityPreset): void {
    const q = QUALITY[preset];
    const { scene } = this.viewer;
    this.viewer.resolutionScale = q.resolutionScale;
    scene.msaaSamples = q.msaaSamples;
    scene.postProcessStages.fxaa.enabled = q.fxaa;
    scene.highDynamicRange = q.hdr && scene.highDynamicRangeSupported;
  }

  private startStatsPump(onStats: (s: SceneStats) => void): void {
    const { scene, camera } = this.viewer;
    let last = performance.now();
    let lastEmit = 0;
    const samples: number[] = [];

    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (dt > 0) {
        samples.push(1000 / dt);
        if (samples.length > 30) samples.shift();
      }
      if (now - lastEmit < STATS_INTERVAL_MS) return;
      lastEmit = now;
      const carto = camera.positionCartographic;
      onStats({
        fps: samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length),
        cameraHeightM: carto.height,
        lon: CesiumMath.toDegrees(carto.longitude),
        lat: CesiumMath.toDegrees(carto.latitude),
      });
    };

    scene.postRender.addEventListener(tick);
    this.detachStats = () => scene.postRender.removeEventListener(tick);
  }

  destroy(): void {
    this.disposed = true;
    this.detachStats?.();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }
}
