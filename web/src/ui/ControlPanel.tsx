import { QUALITY, type QualityPreset } from "../scene/sceneConfig";
import { useStore } from "../state/store";
import { BookmarksPanel } from "./BookmarksPanel";
import { LayerToggles } from "./LayerToggles";

export function ControlPanel() {
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);

  return (
    <div className="control-panel">
      <BookmarksPanel />
      <LayerToggles />

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
