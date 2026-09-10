import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowLeft, Check, Clock3, MapPin } from "lucide-react-native";
import type { Shipment } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { Badge, Txt, fontFamily } from "./ui";

export function ParcelTracking({ shipment, onBack }: { shipment: Shipment; onBack: () => void }) {
  const pickedUp = !!shipment.handoverAt || ["in_transit", "delivered"].includes(shipment.status);
  const inTransit = !!shipment.latestLocationAt || shipment.status === "delivered";
  const nearDestination = shipment.status === "delivered" || !!shipment.latestLocationLabel?.toLocaleLowerCase().includes(shipment.destination.toLocaleLowerCase());
  const delivered = shipment.status === "delivered";
  const steps = [
    { title: "Parcel is picked up", time: shipment.handoverAt, done: pickedUp, checkIn: "Check-in 1:" },
    { title: "Parcel is in transit", time: shipment.latestLocationAt, done: inTransit, checkIn: "Check-in 2:" },
    { title: "Parcel is near destination", time: shipment.latestLocationAt, done: nearDestination, checkIn: "Check-in 3:" },
    { title: "Parcel is delivered -\nPlease confirm if received!", time: shipment.deliveredAt, done: delivered },
  ];

  return <View style={p.screen}>
    <View style={p.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={components.iconButton.hitSlop} pressRetentionOffset={components.iconButton.pressRetentionOffset} onPress={onBack} style={p.back}>
        <ArrowLeft size={components.icon.size.lg} color={semantic.color.text.primary} strokeWidth={components.icon.strokeWidth.regular} />
      </Pressable>
      <Txt pointerEvents="none" style={p.title}>Track your Parcel</Txt><View pointerEvents="none" style={p.headerBalance} />
    </View>
    {shipment.latestLocationLabel && shipment.latestLocationAt ? <View style={p.latestLocation}>
      <View style={p.locationIcon}><MapPin size={components.icon.size.md} color={semantic.color.text.success} strokeWidth={components.icon.strokeWidth.regular} /></View>
      <View style={p.flex}><Txt style={p.locationEyebrow}>LATEST PARCEL LOCATION</Txt><Txt style={p.locationPlace}>{shipment.latestLocationLabel}</Txt><Txt style={p.locationTime}>Updated {clockTime(shipment.latestLocationAt).toLowerCase()}</Txt></View>
    </View> : null}
    <View style={p.trackingSummary}><LocationReportingStatus shipment={shipment} viewerRole="sender" /></View>
    <ScrollView contentContainerStyle={p.timeline}>
      {steps.map((step, index) => <View key={step.title} style={p.timelineStep}>
        <View style={p.timelineRail}>
          <View style={[p.statusDot, !step.done && p.statusDotPending]}><Check size={components.icon.size.sm} color={semantic.color.text.onPrimary} strokeWidth={components.icon.strokeWidth.strong} /></View>
          {index < steps.length - 1 ? <View style={p.railLine} /> : null}
        </View>
        <View style={p.stepContent}>
          <View style={p.stepTitleRow}><Txt style={[p.stepTitle, !step.done && p.pendingTitle]}>{step.title}</Txt>{step.done && step.time ? <Txt style={p.stepTime}>{clockTime(step.time).toLowerCase()}</Txt> : null}</View>
          {step.checkIn ? <View style={p.checkInRow}><Txt style={[p.checkInText, !step.done && p.pendingCheckIn]}>{step.checkIn}</Txt><View style={[p.statusPill, !step.done && p.pendingPill]}>{step.done ? <Check size={components.icon.size.sm} color={semantic.color.text.success} strokeWidth={components.icon.strokeWidth.regular} /> : <Clock3 size={components.icon.size.sm} color={semantic.color.text.warning} strokeWidth={components.icon.strokeWidth.regular} />}<Txt style={[p.pillText, !step.done && p.pendingPillText]}>{step.done ? "Done" : "Pending"}</Txt></View></View> : null}
        </View>
      </View>)}
    </ScrollView>
  </View>;
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
  header: { height: primitives.space[16] + primitives.space[3], paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: components.iconButton.size, height: components.iconButton.size, justifyContent: "center", zIndex: 1 },
  title: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.semibold },
  headerBalance: { width: components.iconButton.size },
  latestLocation: { marginHorizontal: primitives.space[4], marginBottom: primitives.space[2], padding: primitives.space[4], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  locationIcon: { width: primitives.space[10], height: primitives.space[10], borderRadius: primitives.radius.pill, backgroundColor: semantic.color.background.successSoft, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  locationEyebrow: { fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, color: semantic.color.text.tertiary, fontFamily: fontFamily.semibold },
  locationPlace: { marginTop: primitives.space[1], fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  locationTime: { marginTop: primitives.space[1], fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, color: semantic.color.text.tertiary },
  trackingSummary: { marginHorizontal: primitives.space[4], marginBottom: primitives.space[2] },
  reportingSummary: { marginTop: primitives.space[3], gap: primitives.space[2] },
  reportingSummaryCompact: { marginTop: primitives.space[4] },
  reportingCopy: { fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, color: semantic.color.text.tertiary },
  timeline: { paddingHorizontal: primitives.space[4], paddingTop: primitives.space[5], paddingBottom: primitives.space[10] },
  timelineStep: { flexDirection: "row", minHeight: primitives.space[16] * 2 },
  timelineRail: { width: primitives.space[7], alignItems: "center" },
  statusDot: { width: primitives.space[5], height: primitives.space[5], borderRadius: primitives.radius.md, backgroundColor: semantic.color.brand.primary, alignItems: "center", justifyContent: "center", zIndex: 1 },
  statusDotPending: { backgroundColor: semantic.color.background.successSoft },
  railLine: { position: "absolute", top: primitives.space[5], bottom: primitives.space[0], width: primitives.borderWidth.md, backgroundColor: components.journeyCard.arrowBackground },
  stepContent: { flex: 1, paddingLeft: primitives.space[3] },
  stepTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: primitives.space[2] },
  stepTitle: { flex: 1, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, color: semantic.color.text.primary },
  pendingTitle: { color: semantic.color.border.strong },
  stepTime: { fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: semantic.color.text.primary },
  checkInRow: { flexDirection: "row", alignItems: "center", gap: primitives.space[2], marginTop: primitives.space[10] },
  checkInText: { fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: semantic.color.text.primary },
  pendingCheckIn: { color: semantic.color.text.tertiary },
  statusPill: { minHeight: components.button.height.sm, paddingHorizontal: primitives.space[3], borderRadius: primitives.radius.pill, backgroundColor: components.journeyCard.arrowBackground, flexDirection: "row", alignItems: "center", gap: primitives.space[1] },
  pendingPill: { backgroundColor: semantic.color.background.warningSoft },
  pillText: { fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: semantic.color.text.success },
  pendingPillText: { color: semantic.color.text.warning },
});
