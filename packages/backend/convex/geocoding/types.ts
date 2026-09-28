export type GeocodedResult = {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  confidence?: number;
  providerResultId?: string;
};

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodedResult | null>;
}