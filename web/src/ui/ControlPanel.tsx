import {
  EXAGGERATION,
  QUALITY,
  type QualityPreset,
} from "../scene/sceneConfig";
import { useStore } from "../state/store";
import { LayerToggles } from "./LayerToggles";

export function ControlPanel() {
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const exaggeration = useStore((s) => s.exaggeration);
  const setExaggeration = useStore((s) => s.setExaggeration);

  return (
    <div className="control-panel">
      <LayerToggles />

      <section className="panel-section">
        <h2 className="panel-section__title">
          Vertical exaggeration · {exaggeration}×
        </h2>
        <input
          className="slider"
          type="range"
          min={EXAGGERATION.min}
          max={EXAGGERATION.max}
          step={1}
          value={exaggeration}
          onChange={(e) => setExaggeration(Number(e.target.value))}
        />
      </section>

      <section className="panel-section">
        <h2 className="panel-section__title">Quality</h2>
        <select
          className="select"
          value={quality}
          onChange={(e) => setQuality(e.target.value as QualityPreset)}
        >
          {(Object.keys(QUALITY) as QualityPreset[]).map((k) => (
            <option key={k} value={k}>
              {QUALITY[k].label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}
