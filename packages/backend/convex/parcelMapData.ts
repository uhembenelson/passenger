export type MapPoint = [number, number];
export function isMapPoint(value: unknown): value is MapPoint {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

export async function locateCity(city: string, token: string, signal: AbortSignal): Promise<MapPoint> {
  const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?country=ng&types=place&limit=1&access_token=${encodeURIComponent(token)}`, { signal });
  if (!response.ok) throw new Error("City lookup failed");
  const data = await response.json();
  const point = data.features?.[0]?.center;
  if (!isMapPoint(point)) throw new Error("City not found");
  return point;
}

export async function drivingRoute(from: MapPoint, to: MapPoint, token: string, signal: AbortSignal): Promise<MapPoint[] | null> {
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${from.join(',')};${to.join(',')}?overview=simplified&geometries=geojson&access_token=${encodeURIComponent(token)}`, { signal });
  if (!response.ok) return null;
  const data = await response.json();
  const points = data.routes?.[0]?.geometry?.coordinates;
  return Array.isArray(points) && points.length >= 2 && points.every(isMapPoint) ? points : null;
}

export function parcelMapUrl(from: MapPoint, to: MapPoint, last: MapPoint | null, route: MapPoint[] | null, token: string, viewport?: { width: number; height: number }) {
  const size = mapViewport(viewport);
  const make = (points: MapPoint[]) => {
    const line = { type: "Feature", properties: { stroke: "#437966", "stroke-width": 4, "stroke-opacity": 0.7 }, geometry: { type: "LineString", coordinates: points } };
    const overlays = [`geojson(${encodeURIComponent(JSON.stringify(line))})`, `pin-s-a+437966(${from.join(',')})`, `pin-s-b+7957a8(${to.join(',')})`];
    if (last) overlays.push(`pin-l+e58b25(${last.join(',')})`);
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays.join(',')}/auto/${size.width}x${size.height}?padding=${size.padding}&access_token=${encodeURIComponent(token)}`;
  };
  const url = make(route ?? [from, to]);
  return url.length <= 8000 ? { url, roadRoute: !!route } : { url: make([from, to]), roadRoute: false };
}

// Only the rendered image leaves Convex. Provider URLs and credentials stay here.
export async function renderParcelMap(record: {
  origin: string; destination: string; latestLongitude?: number;
  latestLatitude?: number; latestLocationAt?: number;
}, token: string, viewport?: { width: number; height: number }): Promise<{ imageUri: string; roadRoute: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const [from, to] = await Promise.all([
      locateCity(record.origin, token, controller.signal),
      locateCity(record.destination, token, controller.signal),
    ]);
    let route: MapPoint[] | null = null;
    try { route = await drivingRoute(from, to, token, controller.signal); } catch { /* Use an indicative line if directions fail. */ }
    const candidate = [record.latestLongitude, record.latestLatitude];
    const last = record.latestLocationAt && isMapPoint(candidate) ? candidate : null;
    const { url, roadRoute } = parcelMapUrl(from, to, last, route, token, viewport);
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error("Map unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Keep the base64 response below Convex's value size limit.
    if (bytes.length > 700000) throw new Error("Map too large");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return { imageUri: `data:image/png;base64,${btoa(binary)}`, roadRoute };
  } finally { clearTimeout(timeout); }
}

export function mapViewport(viewport?: { width: number; height: number }) {
  if (!viewport) return { width: 640, height: 420, padding: "60" };
  const scale = Math.min(1, 1280 / Math.max(viewport.width, viewport.height));
  const width = Math.max(100, Math.round(viewport.width * scale));
  const height = Math.max(100, Math.round(viewport.height * scale));
  // Reserve space for the floating route card and collapsed status panel.
  const top = Math.round(Math.min(240 * scale, height * 0.30));
  const bottom = Math.round(Math.min(260 * scale, height * 0.32));
  const side = Math.round(Math.min(48 * scale, width * 0.12));
  return { width, height, padding: `${top},${side},${bottom},${side}` };
}
