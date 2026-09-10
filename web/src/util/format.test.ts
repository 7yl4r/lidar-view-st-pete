import { describe, expect, it } from "vitest";
import { clamp, formatAltitude, formatLatLon } from "./format";

describe("formatAltitude", () => {
  it("uses metres under 1 km", () => {
    expect(formatAltitude(820)).toBe("820 m");
    expect(formatAltitude(0)).toBe("0 m");
  });
  it("uses kilometres at/above 1 km", () => {
    expect(formatAltitude(1500)).toBe("1.5 km");
    expect(formatAltitude(9500)).toBe("9.5 km");
  });
  it("handles non-finite input", () => {
    expect(formatAltitude(NaN)).toBe("–");
  });
});

describe("formatLatLon", () => {
  it("formats St. Petersburg", () => {
    expect(formatLatLon(27.7676, -82.6403)).toBe("27.7676°N, 82.6403°W");
  });
  it("handles southern / eastern hemisphere", () => {
    expect(formatLatLon(-33.9, 151.2)).toBe("33.9000°S, 151.2000°E");
  });
});

describe("clamp", () => {
  it("clamps to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});
