import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import type { Shipment } from "@passenger/core";
import { semantic } from "@passenger/design-tokens";
import { Button, Txt, fontFamily } from "./ui";
import { useAction } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";

type MapState = { key: string; url?: string; roadRoute?: boolean; failed?: boolean };

export function ParcelMap({ shipment, width, height, onRouteKind }: { shipment: Shipment; width: number; height: number; onRouteKind: (road: boolean) => void }) {
  const { origin, destination, latestLatitude, latestLongitude, latestLocationAt, latestLocationLabel } = shipment;
  const fetchMap = useAction(api.deliveries.parcelMap);
  const last = !!latestLocationAt && Number.isFinite(latestLongitude) && Number.isFinite(latestLatitude)
    && Math.abs(latestLongitude!) <= 180 && Math.abs(latestLatitude!) <= 90;
  const key = JSON.stringify([shipment.id, origin, destination, latestLongitude, latestLatitude, latestLocationAt, width, height]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MapState>({ key: "" });
  useEffect(() => {
    if (width < 100 || height < 100) return;
    let active = true;
    setState({ key });
    void fetchMap({ shipmentId: shipment.id as Id<"shipments">, viewport: { width, height } }).then(result => {
      if (active) { setState({ key, url: result.imageUri, roadRoute: result.roadRoute }); onRouteKind(result.roadRoute); }
    }).catch(() => {
      if (active) setState({ key, failed: true });
    });
    return () => { active = false; };
  }, [key, attempt, fetchMap, onRouteKind]);
  const current = state.key === key ? state : { key };
  return <View style={m.map}>

      {current.failed ? <View style={m.placeholder}>
        <Txt style={m.title}>Map unavailable</Txt>
        <Button small variant="ghost" title="Retry map" onPress={() => setAttempt(value => value + 1)} />
      </View> : current.url ? <Image key={current.url} source={{ uri: current.url }} style={m.image} resizeMode="stretch" accessibilityLabel={`Parcel journey map from ${origin} to ${destination}${last ? `, last reported near ${latestLocationLabel || 'the marked location'}` : ', awaiting a GPS check-in'}`} onError={() => setState({ key, failed: true })} /> : <View style={m.placeholder}><ActivityIndicator accessibilityLabel="Loading parcel map" color={semantic.color.brand.primary} /></View>}
  </View>;
}

const m = StyleSheet.create({
  map: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: semantic.color.background.app },
  image: { width: '100%', height: '100%' },
  title: { fontFamily: fontFamily.semibold, fontSize: 16, color: semantic.color.text.primary },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
});
