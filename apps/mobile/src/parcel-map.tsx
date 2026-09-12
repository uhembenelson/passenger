import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import type { Shipment } from "@passenger/core";
import { semantic } from "@passenger/design-tokens";
import { Button, Txt, fontFamily, timeDate } from "./ui";
import { useAction } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";

type MapState = { key: string; url?: string; roadRoute?: boolean; failed?: boolean };

export function ParcelMap({ shipment }: { shipment: Shipment }) {
  const { origin, destination, latestLatitude, latestLongitude, latestLocationAt, latestLocationLabel } = shipment;
  const fetchMap = useAction(api.deliveries.parcelMap);
  const last = !!latestLocationAt && Number.isFinite(latestLongitude) && Number.isFinite(latestLatitude)
    && Math.abs(latestLongitude!) <= 180 && Math.abs(latestLatitude!) <= 90;
  const key = JSON.stringify([shipment.id, origin, destination, latestLongitude, latestLatitude, latestLocationAt]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MapState>({ key: "" });
  useEffect(() => {
    let active = true;
    setState({ key });
    void fetchMap({ shipmentId: shipment.id as Id<"shipments"> }).then(result => {
      if (active) setState({ key, url: result.imageUri, roadRoute: result.roadRoute });
    }).catch(() => {
      if (active) setState({ key, failed: true });
    });
    return () => { active = false; };
  }, [key, attempt, fetchMap]);
  const current = state.key === key ? state : { key };
  return <View style={m.card}>
    <View style={m.heading}><Txt style={m.title}>Parcel journey</Txt><Txt style={m.caption}>Pickup and destination pins show approximate city locations.</Txt></View>
    <View style={m.map}>
      {current.failed ? <View style={m.placeholder}>
        <Txt style={m.title}>Map unavailable</Txt>
        <Txt style={m.caption}>{"We couldn't load the map. Your parcel updates are still available."}</Txt>
        <Button small variant="ghost" title="Retry map" onPress={() => setAttempt(value => value + 1)} />
      </View> : current.url ? <Image key={current.url} source={{ uri: current.url }} style={m.image} resizeMode="contain" accessibilityLabel={`Parcel journey map from ${origin} to ${destination}${last ? `, last reported near ${latestLocationLabel || 'the marked location'}` : ', awaiting a GPS check-in'}`} onError={() => setState({ key, failed: true })} /> : <View style={m.placeholder}><ActivityIndicator color={semantic.color.brand.primary} /><Txt style={m.caption}>Loading parcel map…</Txt></View>}
    </View>
    <View style={m.details}>
      <View style={m.row}><View style={[m.dot, { backgroundColor: '#437966' }]} /><Txt style={m.detail}>A · Pickup: {origin}</Txt></View>
      <View style={m.row}><View style={[m.dot, { backgroundColor: '#7957a8' }]} /><Txt style={m.detail}>B · Destination: {destination}</Txt></View>
      <View style={m.row}><View style={[m.dot, { backgroundColor: '#e58b25' }]} /><Txt style={m.detail}>{last ? `Last reported location${latestLocationLabel ? `: ${latestLocationLabel}` : ''}` : 'Waiting for the first GPS check-in'}</Txt></View>
      {last && latestLocationAt ? <Txt style={m.caption}>Updated {timeDate(latestLocationAt)} · Location changes when the traveller checks in.</Txt> : null}
      {current.url && !current.failed ? <Txt style={m.caption}>{current.roadRoute ? 'Suggested road route. The traveller’s actual route may differ.' : 'The line connects the cities; it does not show the actual route travelled.'}</Txt> : null}
    </View>
  </View>;
}

const m = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, overflow: 'hidden', backgroundColor: semantic.color.background.surface },
  heading: { padding: 16, gap: 4 },
  title: { fontFamily: fontFamily.semibold, fontSize: 16, color: semantic.color.text.primary },
  caption: { fontSize: 12, lineHeight: 18, color: semantic.color.text.tertiary },
  map: { width: '100%', aspectRatio: 640 / 420, backgroundColor: semantic.color.background.app },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  details: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  detail: { flex: 1, fontSize: 13, lineHeight: 19, color: semantic.color.text.primary },
});
