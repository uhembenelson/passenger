import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, ChevronDown, ChevronUp, Clock3 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Shipment } from "@passenger/core";
import { semantic } from "@passenger/design-tokens";
import { BackButton, Badge, Button, Txt, fontFamily, timeDate } from "./ui";
import { ParcelMap } from "./parcel-map";

export function ParcelTracking({ shipment, onBack, onProblem }: { shipment: Shipment; onBack: () => void; onProblem: () => void }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [expanded, setExpanded] = useState(false);
  const [roadRoute, setRoadRoute] = useState(true);
  const delivered = shipment.status === "delivered";
  const milestones = [
    { title: "Picked up", time: shipment.handoverAt, done: !!shipment.handoverAt || ["in_transit", "delivered"].includes(shipment.status) },
    { title: "Delivered", time: shipment.deliveredAt, done: delivered },
  ];
  const status = delivered ? "Delivered" : shipment.status === "in_transit" ? "On the way" : shipment.status === "cancelled" ? "Delivery cancelled" : "Awaiting pickup";
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onBack}>
    <View style={p.screen} onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      setSize(previous => previous.width === Math.round(width) && previous.height === Math.round(height) ? previous : { width: Math.round(width), height: Math.round(height) });
    }}>
      <ParcelMap shipment={shipment} width={size.width} height={size.height} onRouteKind={setRoadRoute} />
      <View pointerEvents="box-none" style={[p.top, { top: insets.top + 12 }]}>
        <View style={p.back}><BackButton accessibilityLabel="Close parcel map" onPress={onBack} /></View>
        <View style={p.routeCard}>
          <View style={p.routeRow}><View style={[p.dot, p.pickupDot]} /><Txt style={p.label}>Pickup</Txt><Txt numberOfLines={1} style={p.city}>{shipment.origin}</Txt></View>
          <View style={p.routeRow}><View style={[p.dot, p.destinationDot]} /><Txt style={p.label}>Destination</Txt><Txt numberOfLines={1} style={p.city}>{shipment.destination}</Txt></View>
        </View>
      </View>
      <View style={[p.panel, { bottom: insets.bottom + 36, maxHeight: expanded ? '58%' : '34%' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Collapse parcel details" : "Expand parcel details"} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={p.panelHeader}>
          <View style={p.flex}><Txt style={p.title}>{status}</Txt></View>
          {expanded ? <ChevronDown size={22} color={semantic.color.text.primary} /> : <ChevronUp size={22} color={semantic.color.text.primary} />}
        </Pressable>
        <ScrollView contentContainerStyle={p.panelContent}>
          <View style={p.locationRow}><View style={[p.dot, p.locationDot]} /><View style={p.flex}>
            <Txt style={p.location}>{shipment.latestLocationLabel || 'Awaiting location'}</Txt>
            {shipment.latestLocationAt ? <Txt style={p.small}>Last check-in {timeDate(shipment.latestLocationAt)}</Txt> : null}
          </View></View>
          {expanded ? <>
            <Txt style={p.small}>{roadRoute ? 'Suggested route · Approximate city pins' : 'City connection only · Approximate pins'}</Txt>
            <LocationReportingStatus shipment={shipment} viewerRole="sender" />
            {shipment.latestSafetyCheckInAt ? <Txt style={p.reportingCopy}>Safety confirmed · {timeDate(shipment.latestSafetyCheckInAt)}</Txt> : null}
            {milestones.map(item => <View key={item.title} style={p.milestone}>
              {item.done ? <Check size={18} color={semantic.color.brand.primary} /> : <Clock3 size={18} color={semantic.color.text.tertiary} />}
              <View style={p.flex}><Txt style={p.location}>{item.title}</Txt><Txt style={p.small}>{item.time ? timeDate(item.time) : item.done ? 'Confirmed' : 'Pending'}</Txt></View>
            </View>)}
            <Txt style={p.small}>{shipment.reference}</Txt>
            <Button title="Report a problem" small variant="ghost" onPress={onProblem} />
          </> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

export function LocationReportingStatus({ shipment, viewerRole, compact = false }: { shipment: Shipment; viewerRole: "traveller" | "sender"; compact?: boolean }) {
  if (!shipment.locationCheckInTarget) return null;
  const missed = shipment.missedLocationCheckIns ?? 0;
  const remaining = shipment.locationCheckInRemaining ?? Math.max(0, shipment.locationCheckInTarget - (shipment.locationCheckInCount ?? 0));
  const state = shipment.locationCheckInState ?? (remaining === 0 ? "complete" : "up_to_date");
  const badge = state === "overdue"
    ? viewerRole === "traveller" ? `${missed} missed` : "Update overdue"
    : state === "due_soon"
      ? viewerRole === "traveller" ? "Update due" : "Check-in due"
      : state === "complete"
        ? viewerRole === "traveller" ? "All updates sent" : "All updates received"
        : `${remaining} left`;
  const detail = state === "overdue"
    ? viewerRole === "traveller"
      ? `You missed ${missed} location update${missed === 1 ? "" : "s"}. Share your check-in now.`
      : `The traveller missed ${missed} scheduled update${missed === 1 ? "" : "s"}.`
    : state === "complete"
      ? viewerRole === "traveller"
        ? `You've sent all ${shipment.locationCheckInTarget} expected route updates.`
        : `${shipment.locationCheckInCount ?? shipment.locationCheckInTarget} of ${shipment.locationCheckInTarget} traveller check-ins received.`
      : `${viewerRole === "traveller" ? `${remaining} more update${remaining === 1 ? "" : "s"}` : `${shipment.locationCheckInCount ?? 0} of ${shipment.locationCheckInTarget} updates received`}${shipment.nextLocationCheckInAt ? ` · next ${viewerRole === "traveller" ? "due" : "expected"} ${clockTime(shipment.nextLocationCheckInAt).toLowerCase()}` : ""}`;
  return <View style={[p.reportingSummary, compact && p.reportingSummaryCompact]}><Badge label={badge} tone={state === "overdue" || state === "due_soon" ? "amber" : state === "complete" ? "green" : "neutral"} /><Txt style={p.reportingCopy}>{detail}</Txt></View>;
}

function clockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

const p = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.background.app },
  top: { position: 'absolute', left: 16, right: 16, maxWidth: 460, gap: 12, flexDirection: 'row', alignItems: 'flex-start' },
  back: { backgroundColor: semantic.color.background.surface, borderRadius: 24, elevation: 3 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.semibold, color: semantic.color.text.primary },
  small: { fontSize: 11, lineHeight: 16, color: semantic.color.text.tertiary },
  routeCard: { flex: 1, backgroundColor: semantic.color.background.surface, borderRadius: 20, padding: 14, gap: 8, elevation: 3, shadowColor: '#172c24', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pickupDot: { backgroundColor: '#437966' },
  destinationDot: { backgroundColor: '#7957a8' },
  locationDot: { backgroundColor: '#e58b25' },
  label: { fontSize: 12, lineHeight: 18, color: semantic.color.text.tertiary },
  city: { flex: 1, textAlign: 'right', fontFamily: fontFamily.semibold, fontSize: 14, color: semantic.color.text.primary },
  panel: { position: 'absolute', left: 16, right: 16, maxWidth: 460, borderRadius: 24, backgroundColor: semantic.color.background.surface, elevation: 5, shadowColor: '#172c24', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, overflow: 'hidden' },
  panelHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  panelContent: { paddingHorizontal: 18, paddingBottom: 18, gap: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  location: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.medium, color: semantic.color.text.primary },
  flex: { flex: 1 },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  reportingSummary: { gap: 8 },
  reportingSummaryCompact: { marginTop: 16 },
  reportingCopy: { fontSize: 12, lineHeight: 18, color: semantic.color.text.tertiary },
});
