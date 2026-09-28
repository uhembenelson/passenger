import type { GeocodedResult, GeocodingProvider } from "./types";
import { mapboxProvider } from "./provider";

export type { GeocodedResult, GeocodingProvider } from "./types";

export function defaultGeocodingProvider(): GeocodingProvider | null {
  return mapboxProvider();
}

// Returns null on any provider failure so callers can route to manual review
// instead of aborting the verification flow (plan §9).
export async function geocodeAddress(address: string): Promise<GeocodedResult | null> {
  const provider = defaultGeocodingProvider();
  if (!provider) return null;
  return provider.geocode(address);
}