import { useStore } from "../state/store";
import { formatAltitude, formatLatLon } from "../util/format";

export function StatsHud() {
  const stats = useStore((s) => s.stats);

  return (
    <div className="stats-hud">
      <span className="stats-hud__badge">STAND-IN DATA</span>
      <span>{stats.fps.toFixed(0)} fps</span>
      <span>alt {formatAltitude(stats.cameraHeightM)}</span>
      <span>{formatLatLon(stats.lat, stats.lon)}</span>
    </div>
  );
}
