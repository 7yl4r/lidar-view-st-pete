import { createRoot } from "react-dom/client";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./index.css";
import { App } from "./App";

// NOTE: intentionally no <React.StrictMode> — its dev-mode double-invoke of
// effects tears down and recreates the Cesium Viewer / WebGL context on every
// mount, which is noisy and slow. Re-enable once the engine lifecycle is
// hardened if desired.
const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<App />);
