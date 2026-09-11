import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

// vite-plugin-cesium copies Cesium's static assets (Workers, Assets, Widgets,
// ThirdParty) into the bundle and wires CESIUM_BASE_URL, so the app has no
// runtime dependency on cdn / Cesium ion for engine assets.
export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ["manglillo.marine.usf.edu"],
  },
  preview: {
    host: true,
    allowedHosts: ["manglillo.marine.usf.edu"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
});
