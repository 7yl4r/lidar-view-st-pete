import { BOOKMARKS } from "../scene/sceneConfig";
import { useStore } from "../state/store";

export function BookmarksPanel() {
  const activeBookmark = useStore((s) => s.activeBookmark);
  const flyTo = useStore((s) => s.flyTo);

  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Views</h2>
      <div className="button-column">
        {BOOKMARKS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={
              "chip" + (b.id === activeBookmark ? " chip--active" : "")
            }
            onClick={() => flyTo(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </section>
  );
}
