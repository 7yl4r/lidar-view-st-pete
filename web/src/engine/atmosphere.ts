import { JulianDate, SunLight, Viewer } from "cesium";

/**
 * Presentation lighting / atmosphere tuned toward the reference look
 * (ground atmosphere + fog + HDR + gentle bloom + late-afternoon sun).
 * Values are deliberately conservative for Phase 0; Phase 5 hardens this.
 */
export function configureAtmosphere(viewer: Viewer): void {
  const { scene, clock } = viewer;

  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.atmosphereLightIntensity = 12.0;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;

  scene.fog.enabled = true;
  scene.fog.density = 1.8e-4;
  scene.fog.screenSpaceErrorFactor = 4.0;

  // HDR is a quality-preset choice (SceneController.setQuality). It is left off
  // here because some drivers / software-GL renderers produce a fully black
  // frame with an HDR float framebuffer — not what you want on a video wall.
  scene.light = new SunLight();

  // ~16:15 local (EST = UTC-5) — long shadows, warm light.
  clock.currentTime = JulianDate.fromIso8601("2025-11-05T21:15:00Z");
  clock.shouldAnimate = false;

  viewer.shadows = true;
  scene.shadowMap.softShadows = true;
  scene.shadowMap.maximumDistance = 10000;
  scene.shadowMap.size = 2048;

  const bloom = scene.postProcessStages.bloom;
  bloom.enabled = true;
  bloom.uniforms.glowOnly = false;
  bloom.uniforms.contrast = 120;
  bloom.uniforms.brightness = -0.35;
  bloom.uniforms.delta = 1.0;
  bloom.uniforms.sigma = 2.2;
  bloom.uniforms.stepSize = 1.0;

  scene.postProcessStages.fxaa.enabled = true;
}
