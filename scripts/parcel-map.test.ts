import { describe, expect, test } from 'bun:test';
import { isMapPoint, parcelMapUrl, mapViewport } from '../packages/backend/convex/parcelMapData';

describe('parcel tracking map', () => {
  test('accepts zero coordinates and rejects absent or invalid GPS fixes', () => {
    expect(isMapPoint([0, 0])).toBe(true);
    for (const point of [[undefined, undefined], [181, 0], [0, -91], [NaN, 3], [4, Infinity]]) expect(isMapPoint(point)).toBe(false);
  });
  test('includes endpoint pins, route and latest fix in automatic map bounds', () => {
    const result = parcelMapUrl([3.4, 6.5], [7.5, 9.1], [4, 7], [[3.4, 6.5], [4, 8], [7.5, 9.1]], 'pk.test');
    expect(result.roadRoute).toBe(true);
    expect(result.url).toContain('pin-s-a+437966(3.4,6.5)');
    expect(result.url).toContain('pin-s-b+7957a8(7.5,9.1)');
    expect(result.url).toContain('pin-l+e58b25(4,7)');
    expect(result.url).toContain('/auto/');
    expect(result.url).not.toContain('attribution=false');
  });
  test('does not invent a parcel position before the first GPS check-in', () => {
    const result = parcelMapUrl([3, 6], [7, 9], null, null, 'pk.test');
    expect(result.url).not.toContain('pin-l');
    expect(result.roadRoute).toBe(false);
  });
  test('falls back to an indicative connection if the route exceeds URL limits', () => {
    const route: [number, number][] = Array.from({ length: 1000 }, (_, i) => [3 + i / 1000, 6]);
    const result = parcelMapUrl([3, 6], [7, 9], [4, 7], route, 'pk.test');
    expect(result.url.length).toBeLessThan(8000);
    expect(result.roadRoute).toBe(false);
    expect(result.url).toContain('pin-l+e58b25(4,7)');
  });
});

test('fullscreen map matches portrait aspect and reserves overlay space', () => {
  const viewport = mapViewport({ width: 390, height: 844 });
  expect(viewport.width).toBe(390);
  expect(viewport.height).toBe(844);
  const [top, right, bottom, left] = viewport.padding.split(',').map(Number);
  expect(top).toBeGreaterThanOrEqual(230);
  expect(bottom).toBeGreaterThanOrEqual(240);
  expect(right).toBe(left);
  expect(top + bottom).toBeLessThan(viewport.height);
});
test('large screens retain their aspect ratio within Mapbox limits', () => {
  const viewport = mapViewport({ width: 2560, height: 1600 });
  expect(viewport.width).toBe(1280);
  expect(viewport.height).toBe(800);
});
