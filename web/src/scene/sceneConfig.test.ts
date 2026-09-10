import { describe, expect, it } from "vitest";
import {
  BASEMAP_BOUNDS,
  BOOKMARKS,
  CITY,
  LAYERS,
  QUALITY,
} from "./sceneConfig";

describe("BASEMAP_BOUNDS", () => {
  it("is a well-formed rectangle", () => {
    expect(BASEMAP_BOUNDS.west).toBeLessThan(BASEMAP_BOUNDS.east);
    expect(BASEMAP_BOUNDS.south).toBeLessThan(BASEMAP_BOUNDS.north);
  });

  it("contains the city centre", () => {
    expect(CITY.lon).toBeGreaterThan(BASEMAP_BOUNDS.west);
    expect(CITY.lon).toBeLessThan(BASEMAP_BOUNDS.east);
    expect(CITY.lat).toBeGreaterThan(BASEMAP_BOUNDS.south);
    expect(CITY.lat).toBeLessThan(BASEMAP_BOUNDS.north);
  });
});

describe("BOOKMARKS", () => {
  it("have unique ids", () => {
    const ids = BOOKMARKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sit inside (or just outside) the basemap extent and look downward", () => {
    for (const b of BOOKMARKS) {
      expect(b.lon).toBeGreaterThan(BASEMAP_BOUNDS.west - 0.1);
      expect(b.lon).toBeLessThan(BASEMAP_BOUNDS.east + 0.1);
      expect(b.lat).toBeGreaterThan(BASEMAP_BOUNDS.south - 0.1);
      expect(b.lat).toBeLessThan(BASEMAP_BOUNDS.north + 0.1);
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
