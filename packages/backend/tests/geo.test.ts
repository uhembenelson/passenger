import { expect, it } from "vitest";
import { calculateDistanceMeters, isValidCoordinate, median, medianCoordinate, tryDistanceMeters, type LocationSample } from "../convex/geo";

it("returns zero for identical points and a known short distance", () => {
  expect(calculateDistanceMeters({ latitude: 6.5244, longitude: 3.3792 }, { latitude: 6.5244, longitude: 3.3792 })).toBe(0);
  const distance = calculateDistanceMeters(
    { latitude: 6.5244, longitude: 3.3792 },
    { latitude: 6.5244, longitude: 3.3792 + 0.001 },
  );
  expect(distance).toBeGreaterThan(0);
  expect(distance).toBeLessThan(200);
});

it("handles negative coordinates and rejects invalid ones", () => {
  const distance = calculateDistanceMeters({ latitude: -6.5244, longitude: 3.3792 }, { latitude: -6.5244, longitude: 3.3793 });
  expect(distance).toBeGreaterThan(0);
  expect(isValidCoordinate(91, 0)).toBe(false);
  expect(isValidCoordinate(0, 181)).toBe(false);
  expect(isValidCoordinate(NaN, 3)).toBe(false);
  expect(() => calculateDistanceMeters({ latitude: 100, longitude: 0 }, { latitude: 0, longitude: 0 })).toThrow("Coordinate out of range");
  expect(tryDistanceMeters({ latitude: 100, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeNull();
});

it("computes the median and median coordinate", () => {
  expect(median([5, 1, 3])).toBe(3);
  expect(median([4, 1, 2, 3])).toBe(2.5);
  expect(() => median([])).toThrow("no values");
  const samples: LocationSample[] = [
    { latitude: 6.5241, longitude: 3.3791, accuracyMeters: 30 },
    { latitude: 6.5243, longitude: 3.3792, accuracyMeters: 50 },
    { latitude: 6.5242, longitude: 3.3793, accuracyMeters: 40 },
    { latitude: 6.5244, longitude: 3.3794, accuracyMeters: 60 },
  ];
  expect(medianCoordinate(samples)).toEqual({ latitude: 6.52425, longitude: 3.37925, accuracyMeters: 45, sampleCount: 4 });
});