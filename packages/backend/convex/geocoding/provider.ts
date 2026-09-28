import type { GeocodedResult, GeocodingProvider } from "./types";
import { isValidCoordinate } from "../geo";

// Mapbox forward geocoding provider (plan §9). Provider URL and token stay here.
function mapboxToken(): string | null {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  return token || null;
}

async function fetchGuard(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// A provider failure must route to manual review rather than throwing:
// maps a non-200 / malformed response to null, never to an exception that
// would block the whole verification flow (plan §9).
function safeLatLng(center: unknown): { latitude: number; longitude: number } | null {
  if (!Array.isArray(center) || center.length < 2) return null;
  const [longitude, latitude] = center;
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!isValidCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function mapboxProvider(): GeocodingProvider | null {
  const token = mapboxToken();
  if (!token) return null;
  return {
    async geocode(address: string): Promise<GeocodedResult | null> {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?country=ng&limit=1&access_token=${encodeURIComponent(token)}`;
      try {
        const data = (await fetchGuard(url)) as {
          features?: Array<{
            center?: unknown;
            place_name?: string;
            relevance?: number;
            id?: string;
          }>;
        };
        const feature = data.features?.[0];
        if (!feature) return null;
        const point = safeLatLng(feature.center);
        if (!point) return null;
        return {
          ...point,
          formattedAddress: typeof feature.place_name === "string" ? feature.place_name : undefined,
          confidence: typeof feature.relevance === "number" ? feature.relevance : undefined,
          providerResultId: typeof feature.id === "string" ? feature.id : undefined,
        };
      } catch {
        return null;
      }
    },
  };
}