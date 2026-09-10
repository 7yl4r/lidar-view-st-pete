import { useEffect, useRef } from "react";
import { SceneController } from "./engine/SceneController";
import { useStore } from "./state/store";
import { ControlPanel } from "./ui/ControlPanel";
import { StatsHud } from "./ui/StatsHud";
import { TitleOverlay } from "./ui/TitleOverlay";

export function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const { bindController, setReady, setStats, setError, ready, error } =
    useStore();

  useEffect(() => {
    if (!mountRef.current || controllerRef.current) return;
    const controller = new SceneController(mountRef.current);
    controllerRef.current = controller;
    bindController(controller);

    controller
      .init(setStats)
      .then(() => setReady(true))
      .catch((err: unknown) => {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [bindController, setReady, setStats, setError]);

  return (
    <div className="app">
      <div ref={mountRef} className="cesium-mount" />
      <TitleOverlay />
      <ControlPanel />
      <StatsHud />

      {!ready && !error && (
        <div className="scrim">
          <div className="scrim__card">Loading scene…</div>
        </div>
      )}
      {error && (
        <div className="scrim">
          <div className="scrim__card scrim__card--error">
            Failed to start scene
            <pre>{error}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
