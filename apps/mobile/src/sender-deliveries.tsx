import React, { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { shipmentActions } from "@passenger/core";
import type { Shipment } from "@passenger/core";
import { primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { DeliveryDetail } from "./delivery";
import { ShipmentForm } from "./forms";
import { NeedsActionSheet } from "./needs-action-sheet";
import { receiverCodeMessage, receiverCodeSmsUrl, receiverCodeWhatsAppUrl } from "./receiver-code-share";
import { ReceiverCodeSheet } from "./receiver-code-sheet";
import { Badge, Empty, JourneyCardStack, JourneyRouteCard, Notice, Status, Txt, errorMessage, fontFamily, timeDate } from "./ui";

type DeliveryTab = "attention" | "active" | "completed" | "cancelled";
type FormState = { shipment?: Shipment };
type Props = { navigation: React.ReactNode; notice?: string; onNoticeDismiss?: () => void };

const tabs: { id: DeliveryTab; label: string }[] = [
  { id: "attention", label: "Needs action" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Canceled" },
];

export function SenderDeliveriesScreen({ navigation, notice: externalNotice, onNoticeDismiss }: Props) {
  const data = usePassenger();
  const { snapshot } = data;
  const viewer = snapshot!.viewer!;
  const [tab, setTab] = useState<DeliveryTab>("attention");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [receiverCodeId, setReceiverCodeId] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState<"" | "sms" | "whatsapp">("");
  const [shareError, setShareError] = useState("");
  const [shareDraft, setShareDraft] = useState<{ shipmentId: string; code: string; receiverPhone: string; reference: string } | null>(null);
  const [form, setForm] = useState<FormState>();
  const [notice, setNotice] = useState("");

  const deliveries = useMemo(() => snapshot!.shipments
    .filter(shipment => shipment.senderId === viewer.id || shipment.travellerId === viewer.id)
    .sort((a, b) => b.updatedAt - a.updatedAt), [snapshot, viewer.id]);
  const grouped = useMemo(() => {
    const pendingOfferCount = (shipment: Shipment) => snapshot!.offers?.filter(offer => offer.shipmentId === shipment.id && offer.status === "pending").length ?? 0;
    return {
      attention: deliveries.filter(shipment => needsAction(shipment, viewer.id, pendingOfferCount(shipment))),
      active: deliveries.filter(shipment => isActive(shipment, viewer.id, pendingOfferCount(shipment))),
      completed: deliveries.filter(shipment => shipment.status === "delivered"),
      cancelled: deliveries.filter(shipment => shipment.status === "cancelled"),
    };
  }, [deliveries, snapshot, viewer.id]);

  const selected = selectedId ? snapshot!.shipments.find(shipment => shipment.id === selectedId) : undefined;
  const receiverCodeShipment = receiverCodeId ? snapshot!.shipments.find(shipment => shipment.id === receiverCodeId) : undefined;
  const visible = grouped[tab];
  const empty = emptyState(tab);
  const openForm = (next: FormState) => { setSelectedId(null); setReceiverCodeId(null); setShareError(""); setShareDraft(null); setNotice(""); setForm(next); };
  const openReceiverCodeSheet = (shipment: Shipment) => { setSelectedId(null); setNotice(""); setShareError(""); setShareDraft(null); setReceiverCodeId(shipment.id); };
  const shareReceiverCode = async (channel: "sms" | "whatsapp") => {
    if (!receiverCodeShipment || shareBusy) return;
    setShareBusy(channel);
    setShareError("");
    try {
      let draft = shareDraft && shareDraft.shipmentId === receiverCodeShipment.id ? shareDraft : null;
      if (!draft) {
        draft = { shipmentId: receiverCodeShipment.id, ...(await data.prepareDeliveryShare(receiverCodeShipment.id)) };
        setShareDraft(draft);
      }
      const message = receiverCodeMessage(draft.reference, draft.code);
      const url = channel === "sms" ? receiverCodeSmsUrl(draft.receiverPhone, message) : receiverCodeWhatsAppUrl(draft.receiverPhone, message);
      await Linking.openURL(url);
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setShareBusy("");
    }
  };

  return <View style={d.screen}>
    <ScrollView contentContainerStyle={d.scroll}>
      <Txt style={d.title}>Milestones</Txt>
      {data.offline ? <View style={d.notice}><Notice tone="warning">You're offline. Showing the latest received milestones; reconnect before taking action.</Notice></View> : null}
      {externalNotice ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss success message" onPress={onNoticeDismiss} style={d.notice}><Notice tone="success">{externalNotice}  ×</Notice></Pressable> : null}
      {!externalNotice && notice ? <View style={d.notice}><Notice tone="success">{notice}</Notice></View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={d.tabsRow}>
        {tabs.map(item => {
          const active = item.id === tab;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.id)} style={d.tabButton}>
            <View style={d.tabLabelRow}><Txt style={[d.tabLabel, active && d.tabLabelActive]}>{item.label}</Txt><View style={[d.tabCount, active && d.tabCountActive]}><Txt style={[d.tabCountText, active && d.tabCountTextActive]}>{grouped[item.id].length}</Txt></View></View>
            {active ? <View style={d.tabUnderline} /> : null}
          </Pressable>;
        })}
      </ScrollView>

      {visible.length ? <JourneyCardStack>{visible.map(shipment => {
        const trip = shipment.tripId ? snapshot!.trips.find(item => item.id === shipment.tripId) : undefined;
        const sender = shipment.senderId === viewer.id;
        const pendingOffers = snapshot!.offers?.filter(offer => offer.shipmentId === shipment.id && offer.status === "pending").length ?? 0;
        const next = nextStep(shipment, sender, pendingOffers);
        const onPress = tab === "attention" && sender && shipment.status === "in_transit"
            ? () => openReceiverCodeSheet(shipment)
            : () => setSelectedId(shipment.id);
        return <JourneyRouteCard
          key={shipment.id}
          origin={shipment.origin}
          destination={shipment.destination}
          date={longDate(trip?.departureAt ?? shipment.updatedAt)}
          time={clockTime(trip?.departureAt ?? shipment.updatedAt)}
          header={<View style={d.cardHeader}><Status status={shipment.status} /><Badge label={sender ? "You're sending" : "You're carrying"} tone={sender ? "neutral" : "green"} /></View>}
          detail={<Txt style={d.reference}>{shipment.reference}</Txt>}
          action={{ title: next.action, onPress }}
        >{next.detail ? <Txt style={d.nextStep}>{next.detail}</Txt> : null}</JourneyRouteCard>;
      })}</JourneyCardStack> : <Empty title={empty.title} detail={empty.detail} action={tab !== "attention" ? "Show needs action" : undefined} onAction={tab !== "attention" ? () => setTab("attention") : undefined} />}
    </ScrollView>
    {navigation}
    {selected && tab === "attention" ? <NeedsActionSheet
      key={`${viewer.id}:${selected.id}:${selected.status}:${selected.paymentStatus}`}
      shipment={selected}
      onClose={() => setSelectedId(null)}
      onEdit={() => openForm({ shipment: selected })}
    /> : selected ? <DeliveryDetail
        key={`${viewer.id}:${selected.id}:${selected.status}:${selected.paymentStatus}`}
        shipment={selected}
        onClose={() => setSelectedId(null)}
        onEdit={shipmentActions(selected, viewer).edit ? () => openForm({ shipment: selected }) : undefined}
      /> : null}
    {receiverCodeShipment ? <ReceiverCodeSheet
      receiverPhone={receiverCodeShipment.receiverPhone}
      busy={shareBusy}
      disabled={!!shareBusy}
      error={shareError}
      onClose={() => { if (!shareBusy) { setReceiverCodeId(null); setShareError(""); } }}
      onShareSms={() => void shareReceiverCode("sms")}
      onShareWhatsApp={() => void shareReceiverCode("whatsapp")}
    /> : null}
    {form ? <ShipmentForm shipment={form.shipment} onClose={() => setForm(undefined)} onSuccess={() => {
      setForm(undefined);
      setTab("attention");
      setNotice("Your parcel was updated and resubmitted for review.");
    }} /> : null}
  </View>;
}

function needsAction(shipment: Shipment, viewerId: string, pendingOffers: number) {
  const sender = shipment.senderId === viewerId;
  const traveller = shipment.travellerId === viewerId;
  return shipment.status === "rejected" || shipment.status === "disputed"
    || sender && shipment.status === "open" && pendingOffers > 0
    || sender && ["matched", "funded", "in_transit"].includes(shipment.status)
    || traveller && ["funded", "in_transit"].includes(shipment.status);
}

function isActive(shipment: Shipment, viewerId: string, pendingOffers: number) {
  if (["delivered", "cancelled", "disputed", "rejected"].includes(shipment.status) || needsAction(shipment, viewerId, pendingOffers)) return false;
  return ["pending_review", "open", "matched", "funded", "in_transit"].includes(shipment.status);
}

function nextStep(shipment: Shipment, sender: boolean, pendingOffers: number) {
  if (shipment.status === "pending_review") return { action: "View review", detail: "Under review." };
  if (shipment.status === "rejected") return { action: "Fix & resubmit", detail: shipment.reviewNote || "Needs changes." };
  if (shipment.status === "open") return pendingOffers
    ? { action: `Review ${pendingOffers} offer${pendingOffers === 1 ? "" : "s"}`, detail: "Offers waiting." }
    : { action: "View parcel", detail: "Waiting for offers." };
  if (shipment.status === "matched") return sender
    ? { action: "Pay securely", detail: shipment.payByAt ? `Pay by ${timeDate(shipment.payByAt)}.` : "Pay before handover." }
    : { action: "View payment", detail: "Waiting for payment." };
  if (shipment.status === "funded") return sender
    ? { action: "Prepare handover", detail: "Ready for handover." }
    : { action: "Confirm handover", detail: "Enter the handover code." };
  if (shipment.status === "in_transit") return sender
    ? { action: "Manage delivery proof", detail: "Send the receiver code." }
    : { action: "Confirm delivery", detail: "Ask for the receiver code." };
  if (shipment.status === "delivered") return { action: "Review delivery", detail: "" };
  if (shipment.status === "disputed") return { action: "View dispute", detail: "Under review." };
  return { action: "View cancellation", detail: shipment.cancellationReason || "Cancelled." };
}

function longDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function clockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

function emptyState(tab: DeliveryTab) {
  if (tab === "attention") return { title: "You're all caught up.", detail: "Nothing needs you here." };
  if (tab === "active") return { title: "No active deliveries.", detail: "Nothing active here." };
  if (tab === "completed") return { title: "Nothing here yet.", detail: "" };
  return { title: "Nothing here yet.", detail: "" };
}

const d = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.background.app },
  scroll: { paddingHorizontal: primitives.space[4], paddingTop: primitives.space[7], paddingBottom: primitives.space[7] },
  title: { fontSize: primitives.typography.size.headingH1Web, lineHeight: primitives.typography.lineHeight.headingH1Web, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  notice: { marginTop: primitives.space[4] },
  tabsRow: { flexDirection: "row", alignItems: "flex-end", marginTop: primitives.space[8], marginBottom: primitives.space[6], paddingRight: primitives.space[6] },
  tabButton: { marginRight: primitives.space[6] },
  tabLabelRow: { flexDirection: "row", alignItems: "center", gap: primitives.space[2] },
  tabLabel: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  tabLabelActive: { color: semantic.color.brand.primaryStrong, fontFamily: fontFamily.medium },
  tabCount: { minWidth: primitives.space[6], minHeight: primitives.space[6], paddingHorizontal: primitives.space[1], borderRadius: primitives.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: semantic.color.background.subtle },
  tabCountActive: { backgroundColor: semantic.color.background.successSoft },
  tabCountText: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  tabCountTextActive: { color: semantic.color.text.success },
  tabUnderline: { height: primitives.borderWidth.md, backgroundColor: semantic.color.brand.primary, marginTop: primitives.space[2], borderRadius: primitives.radius.xs },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: primitives.space[2], marginBottom: primitives.space[5], flexWrap: "wrap" },
  reference: { marginBottom: primitives.space[4], color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  nextStep: { marginTop: primitives.space[4], color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
});
