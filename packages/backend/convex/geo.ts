export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// Great-circle distance using the Haversine formula (plan §13).
export function calculateDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  if (!isValidCoordinate(a.latitude, a.longitude) || !isValidCoordinate(b.latitude, b.longitude)) {
    throw new Error("Coordinate out of range.");
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function tryDistanceMeters(a: GeoPoint, b: GeoPoint): number | null {
  try {
    return calculateDistanceMeters(a, b);
  } catch {
    return null;
  }
}

export function median(values: number[]): number {
  if (!values.length) throw new Error("Cannot compute a median of no values.");
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type LocationSample = GeoPoint & { accuracyMeters: number };

export function medianCoordinate(samples: LocationSample[]): {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  sampleCount: number;
} {
  return {
    latitude: median(samples.map(s => s.latitude)),
    longitude: median(samples.map(s => s.longitude)),
    accuracyMeters: median(samples.map(s => s.accuracyMeters)),
    sampleCount: samples.length,
  };
}