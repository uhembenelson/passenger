import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, View } from "react-native";
import type { ListRenderItem } from "react-native";
import { X } from "lucide-react-native";
import { Inbox } from "./social";
import { shipmentActions } from "@passenger/core";
import type { Shipment } from "@passenger/core";
import { primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { DeliveryDetail } from "./delivery";
import { ShipmentForm } from "./forms";
import { NeedsActionSheet } from "./needs-action-sheet";
import { receiverCodeMessage, receiverCodeSmsUrl, receiverCodeWhatsAppUrl } from "./receiver-code-share";
import { ReceiverCodeSheet } from "./receiver-code-sheet";
import { Badge, Empty, JourneyRouteCard, Notice, Status, Txt, errorMessage, fontFamily, timeDate } from "./ui";

type DeliveryTab = "attention" | "all";
type FormState = { shipment?: Shipment };
type Props = { navigation: React.ReactNode; notice?: string; onNoticeDismiss?: () => void };

const tabs: { id: DeliveryTab; label: string }[] = [
  { id: "attention", label: "Needs action" },
  { id: "all", label: "All" },
];

export function NotificationsScreen({ navigation, notice: externalNotice, onNoticeDismiss }: Props) {
  const data = usePassenger();
  const { snapshot } = data;
  const viewer = snapshot?.viewer;
  if (!viewer) return null;
  const [tab, setTab] = useState<DeliveryTab>("attention");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [receiverCodeId, setReceiverCodeId] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState<"" | "sms" | "whatsapp">("");
  const [shareError, setShareError] = useState("");
  const [shareDraft, setShareDraft] = useState<{ shipmentId: string; code: string; receiverPhone: string; reference: string } | null>(null);
  const [form, setForm] = useState<FormState>();
  const [notice, setNotice] = useState("");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const pendingOffersByShipment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const offer of snapshot?.offers ?? []) {
      if (offer.status === "pending") counts.set(offer.shipmentId, (counts.get(offer.shipmentId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.offers]);
  const tripsById = useMemo(() => new Map((snapshot?.trips ?? []).map(trip => [trip.id, trip])), [snapshot?.trips]);
  const shipmentsById = useMemo(() => new Map((snapshot?.shipments ?? []).map(shipment => [shipment.id, shipment])), [snapshot?.shipments]);
  const deliveries = useMemo(() => (snapshot?.shipments ?? [])
    .filter(shipment => viewer?.id && (shipment.senderId === viewer.id || shipment.travellerId === viewer.id))
    .sort((a, b) => b.updatedAt - a.updatedAt), [snapshot?.shipments, viewer?.id]);
  const attention = useMemo(() => deliveries.filter(shipment => needsAction(shipment, viewer.id, pendingOffersByShipment.get(shipment.id) ?? 0)), [deliveries, pendingOffersByShipment, viewer.id]);

  const selected = selectedId ? shipmentsById.get(selectedId) : undefined;
  const receiverCodeShipment = receiverCodeId ? shipmentsById.get(receiverCodeId) : undefined;
  const visible = tab === "attention" ? attention : [];
  const empty = emptyState(tab);
  const openForm = useCallback((next: FormState) => { setSelectedId(null); setReceiverCodeId(null); setShareError(""); setShareDraft(null); setNotice(""); setForm(next); }, []);
  const openReceiverCodeSheet = useCallback((shipment: Shipment) => { setSelectedId(null); setNotice(""); setShareError(""); setShareDraft(null); setReceiverCodeId(shipment.id); }, []);
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

  const renderDelivery: ListRenderItem<Shipment> = useCallback(({ item: shipment }) => {
    const trip = shipment.tripId ? tripsById.get(shipment.tripId) : undefined;
    const sender = shipment.senderId === viewer.id;
    const pendingOffers = pendingOffersByShipment.get(shipment.id) ?? 0;
    const next = nextStep(shipment, sender, pendingOffers);
    const onPress = tab === "attention" && sender && shipment.status === "in_transit"
      ? () => openReceiverCodeSheet(shipment)
      : () => setSelectedId(shipment.id);
    return <DeliveryListItem shipment={shipment} tripDepartureAt={trip?.departureAt} sender={sender} next={next} onPress={onPress} />;
  }, [openReceiverCodeSheet, pendingOffersByShipment, tab, tripsById, viewer.id]);

  const listHeader = <>
      {data.offline ? <View style={d.notice}><Notice tone="warning">You're offline. Showing the latest received updates; reconnect before taking action.</Notice></View> : null}
      {externalNotice ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss success message" onPress={onNoticeDismiss} style={d.notice}><Notice tone="success"><View style={d.dismissNotice}><Txt>{externalNotice}</Txt><X size={16} color={semantic.color.text.secondary} /></View></Notice></Pressable> : null}
      {!externalNotice && notice ? <View style={d.notice}><Notice tone="success">{notice}</Notice></View> : null}
      <View style={d.tabsRow} accessibilityRole="tablist">
        {tabs.map(item => {
          const active = item.id === tab;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.id)} style={[d.tabButton, active && d.tabButtonActive]}>
            <View style={d.tabLabelRow}><Txt numberOfLines={1} style={[d.tabLabel, active && d.tabLabelActive]}>{item.label}</Txt>{item.id === "attention" ? <View style={[d.tabCount, active && d.tabCountActive]}><Txt style={[d.tabCountText, active && d.tabCountTextActive]}>{attention.length}</Txt></View> : null}</View>
          </Pressable>;
        })}
      </View>
    </>;

  return <View style={d.screen}>
    <View style={[d.nativeHeader, headerCollapsed && d.nativeHeaderCollapsed]}><Txt accessibilityRole="header" style={[d.title, headerCollapsed && d.titleCollapsed]}>Notifications</Txt></View>
    <FlatList
      data={visible}
      renderItem={renderDelivery}
      keyExtractor={deliveryKey}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={tab === "all" ? <Inbox showHeading={false} onDetail={setSelectedId} /> : <Empty illustration="milestonesClear" title={empty.title} detail={empty.detail} action="View all notifications" onAction={() => setTab("all")} />}
      ItemSeparatorComponent={DeliverySeparator}
      contentContainerStyle={d.scroll}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={32}
      windowSize={5}
      scrollEventThrottle={32}
      onScroll={event => setHeaderCollapsed(event.nativeEvent.contentOffset.y > 28)}
    />
    {navigation}
    {selected && tab === "attention" ? <NeedsActionSheet
      key={`${viewer.id}:${selected.id}`}
      shipment={selected}
      onClose={() => setSelectedId(null)}
      onEdit={() => openForm({ shipment: selected })}
    /> : selected ? <DeliveryDetail
        key={`${viewer.id}:${selected.id}`}
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

const DeliveryListItem = memo(function DeliveryListItem({ shipment, tripDepartureAt, sender, next, onPress }: {
  shipment: Shipment;
  tripDepartureAt?: number;
  sender: boolean;
  next: ReturnType<typeof nextStep>;
  onPress: () => void;
}) {
  const timestamp = tripDepartureAt ?? shipment.updatedAt;
  return <JourneyRouteCard
    origin={shipment.origin}
    destination={shipment.destination}
    date={longDate(timestamp)}
    time={clockTime(timestamp)}
    header={<View style={d.cardHeader}><Status status={shipment.status} /><Badge label={sender ? "You're sending" : "You're carrying"} tone={sender ? "neutral" : "green"} /></View>}
    detail={<Txt style={d.reference}>{shipment.reference}</Txt>}
    action={{ title: next.action, onPress }}
  >{next.detail ? <Txt style={d.nextStep}>{next.detail}</Txt> : null}</JourneyRouteCard>;
});

function deliveryKey(shipment: Shipment) { return shipment.id; }
function DeliverySeparator() { return <View style={d.itemSeparator} />; }

function needsAction(shipment: Shipment, viewerId: string, pendingOffers: number) {
  const sender = shipment.senderId === viewerId;
  const traveller = shipment.travellerId === viewerId;
  return shipment.status === "rejected" || shipment.status === "disputed"
    || sender && shipment.status === "open" && pendingOffers > 0
    || sender && ["matched", "funded", "in_transit"].includes(shipment.status)
    || traveller && ["funded", "in_transit"].includes(shipment.status);
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
    ? { action: "Hand over parcel", detail: "Meet your traveller to hand over." }
    : { action: "Receive parcel", detail: "Meet the sender to collect." };
  if (shipment.status === "in_transit") return sender
    ? { action: "Manage delivery proof", detail: "Send the receiver code." }
    : { action: "Confirm delivery", detail: "Ask for the receiver code." };
  if (shipment.status === "delivered") return { action: "Review delivery", detail: "Delivery completed and confirmed." };
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
  if (tab === "attention") return { title: "You're all caught up.", detail: "When a parcel requires payment, handover, code verification, or review, it will appear here." };
  return { title: "No notifications yet.", detail: "Your account and delivery updates will appear here." };
}

const d = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.background.app },
  scroll: { paddingHorizontal: primitives.space[4], paddingTop: primitives.space[7], paddingBottom: primitives.space[7] },
  title: { fontSize: primitives.typography.size.headingH1Web, lineHeight: primitives.typography.lineHeight.headingH1Web, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  titleCollapsed: { fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3 },
  nativeHeader: { minHeight: 72, justifyContent: "flex-end", paddingHorizontal: primitives.space[4], paddingBottom: primitives.space[3], backgroundColor: semantic.color.background.app, borderBottomWidth: 0 },
  nativeHeaderCollapsed: { minHeight: 52, justifyContent: "center", paddingBottom: 0, borderBottomWidth: primitives.borderWidth.sm, borderBottomColor: semantic.color.border.subtle },
  dismissNotice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  notice: { marginTop: primitives.space[4] },
  tabsRow: { flexDirection: "row", alignItems: "center", gap: primitives.space[2], marginTop: primitives.space[6], marginBottom: primitives.space[6] },
  tabButton: { flex: 1, minHeight: 44, paddingHorizontal: primitives.space[3], borderRadius: primitives.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: semantic.color.background.surface },
  tabButtonActive: { backgroundColor: semantic.color.background.successSoft },
  tabLabelRow: { flexDirection: "row", alignItems: "center", gap: primitives.space[2] },
  tabLabel: { flexShrink: 1, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  tabLabelActive: { color: semantic.color.brand.primaryStrong, fontFamily: fontFamily.medium },
  tabCount: { minWidth: primitives.space[6], minHeight: primitives.space[6], paddingHorizontal: primitives.space[1], borderRadius: primitives.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: semantic.color.background.subtle },
  tabCountActive: { backgroundColor: semantic.color.background.successSoft },
  tabCountText: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  tabCountTextActive: { color: semantic.color.text.success },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: primitives.space[2], marginBottom: primitives.space[5], flexWrap: "wrap" },
  reference: { marginBottom: primitives.space[4], color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  nextStep: { marginTop: primitives.space[4], color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  itemSeparator: { height: primitives.space[4] },
});
