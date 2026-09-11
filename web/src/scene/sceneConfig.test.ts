import { describe, expect, it } from "vitest";
import {
  BOOKMARKS,
  CITY,
  LAYERS,
  QUALITY,
  SCENE_BOUNDS,
} from "./sceneConfig";

describe("SCENE_BOUNDS", () => {
  it("is a well-formed rectangle", () => {
    expect(SCENE_BOUNDS.west).toBeLessThan(SCENE_BOUNDS.east);
    expect(SCENE_BOUNDS.south).toBeLessThan(SCENE_BOUNDS.north);
  });

  it("contains the city centre", () => {
    expect(CITY.lon).toBeGreaterThan(SCENE_BOUNDS.west);
    expect(CITY.lon).toBeLessThan(SCENE_BOUNDS.east);
    expect(CITY.lat).toBeGreaterThan(SCENE_BOUNDS.south);
    expect(CITY.lat).toBeLessThan(SCENE_BOUNDS.north);
  });
});

describe("BOOKMARKS", () => {
  it("have unique ids", () => {
    const ids = BOOKMARKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sit inside (or just outside) the scene bounds and look downward", () => {
    for (const b of BOOKMARKS) {
      expect(b.lon).toBeGreaterThan(SCENE_BOUNDS.west - 0.1);
      expect(b.lon).toBeLessThan(SCENE_BOUNDS.east + 0.1);
      expect(b.lat).toBeGreaterThan(SCENE_BOUNDS.south - 0.1);
      expect(b.lat).toBeLessThan(SCENE_BOUNDS.north + 0.1);
      expect(b.height).toBeGreaterThan(0);
      expect(b.pitch).toBeLessThan(0);
      expect(b.pitch).toBeGreaterThanOrEqual(-90);
    }
  });
});

describe("LAYERS / QUALITY", () => {
  it("layer ids are unique", () => {
    const ids = LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("quality presets have sane values", () => {
    for (const p of Object.values(QUALITY)) {
      expect(p.resolutionScale).toBeGreaterThan(0);
      expect([1, 2, 4, 8]).toContain(p.msaaSamples);
      expect(typeof p.hdr).toBe("boolean");
      expect(typeof p.fxaa).toBe("boolean");
    }
  });
});
