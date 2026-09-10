import { useStore } from "../state/store";

export function LayerToggles() {
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);

  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Layers</h2>
      <div className="button-column">
        {layers.map((l) => (
          <label key={l.id} className="toggle-row">
            <input
              type="checkbox"
              checked={l.visible}
              onChange={() => toggleLayer(l.id)}
            />
            <span>{l.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
