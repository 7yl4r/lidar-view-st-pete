import { Math as CesiumMath, Viewer } from "cesium";
import { addBuildings, type BuildingsHandle } from "../layers/buildingsLayer";
import { addDemSurface, type DemSurfaceHandle } from "../layers/demLayer";
import { addPointCloud, type PointCloudHandle } from "../layers/pointCloudLayer";
import { createTerrainProvider } from "../layers/terrain";
import type { LayerHandle } from "../layers/types";
import {
  BOOKMARKS,
  EXAGGERATION,
  LAYERS,
  QUALITY,
  type QualityPreset,
} from "../scene/sceneConfig";
import { configureAtmosphere } from "./atmosphere";
import { type CameraPose, flyToCamera, getCameraPose } from "./camera";
import { createViewer } from "./createViewer";
import { readUrlViewState } from "./urlState";

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
  private demSurface: DemSurfaceHandle | null = null;
  private pointCloud: PointCloudHandle | null = null;
  private buildings: BuildingsHandle | null = null;
  private disposed = false;
  private detachStats?: () => void;
  private detachCameraSync?: () => void;

  constructor(container: HTMLElement) {
    this.viewer = createViewer(container);
    // Debug handle — useful when diagnosing rendering on viz-center hardware.
    (window as unknown as { __scene?: Viewer }).__scene = this.viewer;
  }

  async init(
    onStats: (s: SceneStats) => void,
    onCameraChange: (pose: CameraPose) => void,
  ): Promise<void> {
    const { viewer } = this;
    const urlState = readUrlViewState();
    configureAtmosphere(viewer);
    this.setQuality("workstation");

    viewer.scene.terrainProvider = await createTerrainProvider();
    if (this.disposed) return;
    const initialExaggeration = urlState.exaggeration ?? EXAGGERATION.default;
    this.setVerticalExaggeration(initialExaggeration);

    const demSurface = await addDemSurface(viewer, initialExaggeration);
    if (this.disposed) return;
    if (demSurface) {
      this.demSurface = demSurface;
      this.register(demSurface);
    }

    const pointCloud = await addPointCloud(viewer, initialExaggeration);
    if (this.disposed) return;
    if (pointCloud) {
      this.pointCloud = pointCloud;
      this.register(pointCloud);
    }

    const buildings = await addBuildings(viewer, initialExaggeration);
    if (this.disposed) return;
    if (buildings) {
      this.buildings = buildings;
      this.register(buildings);
    }

    // Reconcile each registered layer's actual visibility with the URL (or
    // its configured default) -- the layer modules themselves always start
    // visible, so without this a `defaultVisible: false` config, or a URL
    // that hides a layer, would be reflected in the UI checkbox but not in
    // what's actually rendered.
    for (const [id, handle] of this.layers) {
      const visible = urlState.visibleLayers
        ? urlState.visibleLayers.includes(id)
        : (LAYERS.find((l) => l.id === id)?.defaultVisible ?? true);
      handle.setVisible(visible);
    }

    flyToCamera(viewer, urlState.camera ?? BOOKMARKS[0], 0);
    onCameraChange(getCameraPose(viewer));

    const onMoveEnd = () => onCameraChange(getCameraPose(viewer));
    viewer.camera.moveEnd.addEventListener(onMoveEnd);
    this.detachCameraSync = () => viewer.camera.moveEnd.removeEventListener(onMoveEnd);

    this.startStatsPump(onStats);
  }

  setVerticalExaggeration(scale: number): void {
    const { scene } = this.viewer;
    scene.verticalExaggeration = scale;
    scene.verticalExaggerationRelativeHeight = EXAGGERATION.relativeHeight;
    this.demSurface?.setExaggeration(scale);
    this.pointCloud?.setExaggeration(scale);
    this.buildings?.setExaggeration(scale);
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
    this.detachCameraSync?.();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }
}
