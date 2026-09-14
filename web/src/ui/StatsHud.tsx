import { useState } from "react";
import { useStore } from "../state/store";
import { formatAltitude, formatLatLon } from "../util/format";
import { DataInfoModal } from "./DataInfoModal";

export function StatsHud() {
  const stats = useStore((s) => s.stats);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <>
      <div className="stats-hud">
        <button
          type="button"
          className="stats-hud__info-btn"
          onClick={() => setInfoOpen(true)}
          aria-haspopup="dialog"
        >
          More info
        </button>
        <span>{stats.fps.toFixed(0)} fps</span>
        <span>alt {formatAltitude(stats.cameraHeightM)}</span>
        <span>{formatLatLon(stats.lat, stats.lon)}</span>
      </div>
      {infoOpen && <DataInfoModal onClose={() => setInfoOpen(false)} />}
    </>
  );
}
