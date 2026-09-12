import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { usePaginatedQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { money, shipmentActions, type Shipment } from "@passenger/core";
import { usePassenger } from "./data";
import { DeliveryDetail } from "./delivery";
import { ShipmentForm } from "./forms";
import { BackButton, Button, ContentSkeleton, Empty, Notice, Status, Txt, colors, fontFamily, s, timeDate } from "./ui";

export function ParcelHistory({ onBack }: { onBack: () => void }) {
  const { snapshot, offline } = usePassenger();
  const { results, status, loadMore } = usePaginatedQuery(api.marketplace.mySentParcelsPage, {}, { initialNumItems: 30 });
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<Shipment>();
  const selected = results.find(parcel => parcel.id === selectedId);

  return <View style={h.screen}>
    <View style={h.header}>
      <BackButton accessibilityLabel="Back to profile" onPress={onBack} />
      <Txt accessibilityRole="header" style={h.title}>Parcel history</Txt>
      <Txt style={s.muted}>All parcels you've sent, newest first.</Txt>
    </View>
    <FlatList
      data={results}
      keyExtractor={parcel => parcel.id}
      contentContainerStyle={h.list}
      ListHeaderComponent={offline ? <Notice tone="warning">You're offline. Reconnect to load older parcels and the latest updates.</Notice> : null}
      ListEmptyComponent={status === "LoadingFirstPage" ? <ContentSkeleton rows={3} /> : <Empty illustration="milestonesClear" title="No parcels sent yet" detail="Parcels you send will appear here, including completed and cancelled deliveries." />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`View parcel ${item.reference}, ${item.origin} to ${item.destination}`} onPress={() => setSelectedId(item.id)} style={h.card}>
        <View style={h.row}><Txt style={s.hint}>{item.reference}</Txt><Status status={item.status} /></View>
        <View style={h.row}><Txt style={[s.h3, h.route]}>{item.origin} → {item.destination}</Txt><ChevronRight size={20} color={colors.muted} /></View>
        <Txt style={s.muted}>{item.category} · {item.weightKg} kg · {money(item.feeNaira)}</Txt>
        <Txt style={s.muted}>To {item.receiverName}</Txt>
        <Txt style={s.hint}>Created {timeDate(item.createdAt)}</Txt>
      </Pressable>}
      ListFooterComponent={status === "LoadingMore" ? <ActivityIndicator color={colors.forest} /> : status === "CanLoadMore" ? <Button title="Load older parcels" variant="secondary" disabled={offline} onPress={() => loadMore(30)} /> : null}
    />
    {selected && <DeliveryDetail key={selected.id} shipment={selected} onClose={() => setSelectedId(undefined)} onEdit={snapshot?.viewer && shipmentActions(selected, snapshot.viewer).edit ? () => { setEditing(selected); setSelectedId(undefined); } : undefined} />}
    {editing && <ShipmentForm shipment={editing} onClose={() => setEditing(undefined)} onSuccess={() => { setSelectedId(editing.id); setEditing(undefined); }} />}
  </View>;
}

const h = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, gap: 8 },
  title: { fontSize: 28, fontFamily: fontFamily.semibold, color: colors.text },
  list: { paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  card: { backgroundColor: colors.paper, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  route: { flex: 1 },
});
