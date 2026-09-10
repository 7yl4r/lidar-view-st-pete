import { CITY } from "../scene/sceneConfig";

export function TitleOverlay() {
  return (
    <div className="title-overlay">
      <div className="title-overlay__name">{CITY.name}</div>
      <div className="title-overlay__sub">
        LiDAR Scene Player · Phase&nbsp;0 · <em>stand-in data</em>
      </div>
    </div>
  );
}
