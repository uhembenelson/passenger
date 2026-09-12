import React, { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import type { ListRenderItem, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowRight, Check } from "lucide-react-native";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { matchExplanation, money, tripRoute } from "@passenger/core";
import type { Shipment, Trip } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { TripForm } from "./forms";
import { DraggableFAB } from "./draggable-fab";
import { Badge, Button, ContentSkeleton, Empty, errorMessage, Field, JourneyRouteCard, Notice, PresentationSheet, Txt, colors, fontFamily } from "./ui";

type ParcelMatch = { parcel: Shipment; trips: Trip[] };
type MarketplaceListItem = { kind: "trip"; trip: Trip } | { kind: "parcel"; match: ParcelMatch };

type Props = {
  navigation: React.ReactNode;
  notice?: string;
  requestOpenScheduleTrip?: boolean;
  onScheduleTripFlowHandled?: () => void;
  onTripScheduled?: () => void;
};

export function MobileTripsScreen({ navigation, notice, requestOpenScheduleTrip = false, onScheduleTripFlowHandled, onTripScheduled }: Props) {
  const data = usePassenger();
  const { snapshot, offline } = data;
  const viewer = snapshot?.viewer;
  const [selected, setSelected] = useState<Trip>();
  const [editing, setEditing] = useState<Trip>();
  const [creating, setCreating] = useState(false);
  const [localNotice, setLocalNotice] = useState("");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const { results: myTripResults, status: myTripStatus, loadMore: loadMoreMyTrips } = usePaginatedQuery(api.marketplace.myTripsPage, {}, { initialNumItems: 30 });
  const now = useMemo(() => Date.now(), [myTripResults]);
  const mine = useMemo(() => [...myTripResults].sort((a, b) => b.departureAt - a.departureAt), [myTripResults]);

  const openScheduleSheet = () => {
    setCreating(true);
    onScheduleTripFlowHandled?.();
  };

  React.useEffect(() => {
    if (requestOpenScheduleTrip) openScheduleSheet();
  }, [requestOpenScheduleTrip]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const collapsed = event.nativeEvent.contentOffset.y > 28;
    setHeaderCollapsed(current => current === collapsed ? current : collapsed);
  }, []);
  const history = useMemo(() => mine.filter(trip => trip.departureAt <= now || trip.status === "completed" || trip.status === "cancelled"), [mine, now]);
  const historyItems = useMemo<MarketplaceListItem[]>(() => history
    .map(trip => ({ kind: "trip", trip })), [history]);
  const renderHistoryItem: ListRenderItem<MarketplaceListItem> = useCallback(({ item }) => item.kind === "trip"
    ? <TripRow trip={item.trip} viewerId={viewer?.id ?? ""} now={now} onSelectMine={setSelected} onSelectTraveller={() => undefined} />
    : null, [now, viewer?.id]);
  const loadMoreMine = useCallback(() => loadMoreMyTrips(30), [loadMoreMyTrips]);
  const emptyState = { title: "No past trips yet.", detail: "Trips appear here after departure or when cancelled.", action: "Publish a trip" };
  const activeStatus = myTripStatus;

  return <View style={t.screen}>
    <View style={[t.nativeHeader, headerCollapsed && t.nativeHeaderCollapsed]}><Txt accessibilityRole="header" style={[t.title, headerCollapsed && t.titleCollapsed]}>Trip history</Txt></View>
    {localNotice ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss trip success message" onPress={() => setLocalNotice("")} style={t.successBannerWrap}><View style={t.successBanner}><View style={t.successIcon}><Check size={18} color="#34C97B" strokeWidth={3} /></View><Txt style={t.successText}>{localNotice}</Txt></View></Pressable> : null}
    <FlatList
      data={historyItems}
      renderItem={renderHistoryItem}
      keyExtractor={marketplaceItemKey}
      ItemSeparatorComponent={TripListSeparator}
      contentContainerStyle={t.scroll}
      scrollEventThrottle={32}
      onScroll={handleScroll}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={32}
      windowSize={5}
      onEndReached={myTripStatus === "CanLoadMore" ? loadMoreMine : undefined}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={<>
      {offline ? <Notice tone="warning">You're offline. Trip and parcel actions will be available again after you reconnect.</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      {historyItems.length > 0 && <Button title="Publish a trip" variant="lime" onPress={openScheduleSheet} style={t.publishButton} />}
      </>}
      ListEmptyComponent={(activeStatus === "LoadingFirstPage")
        ? <ContentSkeleton rows={3} />
        : <Empty illustration="milestonesClear" title={emptyState.title} detail={emptyState.detail} action={emptyState.action} onAction={openScheduleSheet} />}
      ListFooterComponent={myTripStatus === "LoadingMore" ? (
        <View style={t.listFooterLoading}>
          <ActivityIndicator size="small" color={semantic.color.brand.primary} />
        </View>
      ) : null}
    />
    {historyItems.length > 0 && <DraggableFAB onPress={openScheduleSheet} />}
    {navigation}
    {selected ? <ManageTripSheet trip={selected} onClose={() => setSelected(undefined)} onEdit={() => { setSelected(undefined); setEditing(selected); }} /> : null}
    {editing ? <TripForm trip={editing} onClose={() => setEditing(undefined)} onSuccess={() => setEditing(undefined)} /> : null}
    {creating ? <TripForm onClose={() => { setCreating(false); onScheduleTripFlowHandled?.(); }} onSuccess={() => {
      setCreating(false);
      setLocalNotice("Your trip is live.");
      onScheduleTripFlowHandled?.();
      onTripScheduled?.();
    }} /> : null}
  </View>;

}

const ParcelMatchRow = memo(function ParcelMatchRow({ match, onSelect }: { match: ParcelMatch; onSelect: (match: ParcelMatch) => void }) {
  const { parcel, trips } = match;
  return <JourneyRouteCard
    origin={parcel.origin}
    destination={parcel.destination}
    date={longDate(parcel.preferredPickupAt ?? parcel.readyAt ?? parcel.updatedAt)}
    time={clockTime(parcel.preferredPickupAt ?? parcel.readyAt ?? parcel.updatedAt)}
    header={<View style={t.cardHeader}><Badge label={parcel.category} tone="neutral" /><Txt style={t.traveller}>{parcel.senderName}</Txt></View>}
    detail={<Txt style={t.reference}>{parcel.weightKg} kg · {money(parcel.feeNaira)} offered</Txt>}
    action={{ title: "Offer to carry", onPress: () => onSelect(match) }}
  ><Txt style={t.matchReason}>{matchExplanation(parcel, trips[0]!)}</Txt></JourneyRouteCard>;
});

const TripRow = memo(function TripRow({ trip, viewerId, now, onSelectMine, onSelectTraveller }: { trip: Trip; viewerId: string; now: number; onSelectMine: (trip: Trip) => void; onSelectTraveller: (trip: Trip) => void }) {
  const mineTrip = trip.travellerId === viewerId;
  const status = tripStatus(trip, now);
  return <JourneyRouteCard
    origin={trip.origin}
    destination={trip.destination}
    date={longDate(trip.departureAt)}
    time={clockTime(trip.departureAt)}
    header={<View style={t.cardHeader}><Badge label={mineTrip ? status.label : "Verified traveller"} tone={status.tone} /><Txt style={t.traveller}>{mineTrip ? "Your trip" : trip.travellerName}</Txt></View>}
    detail={<Txt style={t.reference}>{trip.stops?.length ? `Via ${trip.stops.join(" · ")}` : "Direct trip"}</Txt>}
    action={{ title: mineTrip ? status.ended ? "View trip" : "Manage trip" : "View traveller", onPress: () => mineTrip ? onSelectMine(trip) : onSelectTraveller(trip) }}
  ><View style={t.tripMeta}><Txt style={t.metaText}>{availableCapacity(trip)} kg available</Txt><Txt style={t.metaText}>{trip.maxParcelWeightKg ?? trip.capacityKg} kg max parcel</Txt></View></JourneyRouteCard>;
});

function marketplaceItemKey(item: MarketplaceListItem) { return item.kind === "trip" ? `trip:${item.trip.id}` : `parcel:${item.match.parcel.id}`; }
function TripListSeparator() { return <View style={t.listSeparator} />; }
function TravellerTripSheet({ trip, onClose, onContinue }: { trip: Trip; onClose: () => void; onContinue: () => void }) {
  const profile = useQuery(api.marketplaceProfiles.publicProfile, { userId: trip.travellerId as Id<"users"> });
  return <PresentationSheet title={trip.travellerName} onClose={onClose}>
    <View style={t.sheetContext}>
      <View style={t.profileHeading}><Badge label="Verified traveller" tone="green" /><Txt style={t.metaText}>Member since {profile ? new Date(profile.joinedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}</Txt></View>
      <Txt style={t.sheetRoute}>{trip.origin} → {trip.destination}</Txt>
      <Txt style={t.metaText}>{longDate(trip.departureAt)} · {clockTime(trip.departureAt)} · {availableCapacity(trip)} kg available</Txt>
    </View>
    <View style={t.profileStats}>
      <ProfileStat value={profile?.rating?.toFixed(1) ?? "—"} label="Rating" />
      <ProfileStat value={String(profile?.reviewCount ?? 0)} label="Reviews" />
      <ProfileStat value={String(profile?.successfulDeliveries ?? 0)} label="Deliveries" />
    </View>
    <Txt style={t.metaText}>Carries {trip.acceptedCategories?.length ? trip.acceptedCategories.join(", ") : "all supported categories"} · up to {trip.maxParcelWeightKg ?? trip.capacityKg} kg per parcel</Txt>
    {trip.handlingNotes ? <Notice>{trip.handlingNotes}</Notice> : null}
    {profile?.reviews.slice(0, 3).map(review => <View key={review.id} style={t.review}><Txt style={t.metaText}>{review.rating} / 5</Txt><Txt style={t.reviewText}>{review.comment}</Txt></View>)}
    <Button title="Send a parcel this way" variant="lime" onPress={onContinue} />
  </PresentationSheet>;
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return <View style={t.profileStat}><Txt style={t.profileValue}>{value}</Txt><Txt style={t.metaText}>{label}</Txt></View>;
}

function CarryOfferSheet({ parcel, trips, onClose }: { parcel: Shipment; trips: Trip[]; onClose: () => void }) {
  const data = usePassenger();
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const selectedTrip = trips.find(trip => trip.id === tripId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!selectedTrip) return;
    setBusy(true);
    setError("");
    try {
      await data.matchShipment(parcel.id, selectedTrip.id, { expiresAt: Math.min(selectedTrip.departureAt, Date.now() + 24 * 3600000), note: note.trim() });
      onClose();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return <PresentationSheet title="Offer to carry" onClose={() => !busy && onClose()}>
    <View style={t.sheetContext}><Txt style={t.sheetRoute}>{parcel.origin} → {parcel.destination}</Txt><Txt style={t.metaText}>{parcel.category} · {parcel.weightKg} kg · fixed delivery fee {money(parcel.feeNaira)}</Txt></View>
    <Txt style={t.sectionLabel}>Choose your trip</Txt>
    <View style={t.choiceStack}>{trips.map(trip => <Pressable key={trip.id} accessibilityRole="radio" accessibilityState={{ checked: trip.id === tripId }} onPress={() => { setTripId(trip.id); }} style={[t.tripChoice, trip.id === tripId && t.tripChoiceSelected]}><Txt style={t.choiceTitle}>{longDate(trip.departureAt)} · {clockTime(trip.departureAt)}</Txt><Txt style={t.metaText}>{matchExplanation(parcel, trip)}</Txt></Pressable>)}</View>
    <Field label="Note to sender (optional)" value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Pickup timing or handling details" />
    {error ? <Notice tone="error">{error}</Notice> : null}
    <Button title="Send carry offer" variant="lime" busy={busy} disabled={!selectedTrip || busy} onPress={() => void submit()} />
  </PresentationSheet>;
}

function ManageTripSheet({ trip, onClose, onEdit }: { trip: Trip; onClose: () => void; onEdit: () => void }) {
  const { snapshot, offline, withdrawOffer } = usePassenger();
  const cancel = useMutation(api.journeys.cancel);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const ended = trip.status === "cancelled" || trip.status === "completed" || trip.departureAt <= Date.now();
  const committed = (trip.reservedKg ?? 0) > 0 || (snapshot?.shipments ?? []).some(shipment => shipment.tripId === trip.id && !["cancelled", "rejected"].includes(shipment.status));
  const tripOffers = snapshot?.offers?.filter(offer => offer.tripId === trip.id && offer.status === "pending") ?? [];

  const handleWithdraw = async (offerId: string) => {
    setWithdrawingId(offerId);
    setError("");
    try {
      await withdrawOffer(offerId);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setWithdrawingId(null);
    }
  };

  const cancelTrip = async () => {
    setBusy(true);
    setError("");
    try {
      await cancel({ tripId: trip.id as Id<"trips">, reason: reason.trim() });
      onClose();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return <PresentationSheet title="Manage trip" onClose={() => !busy && onClose()}>
    <View style={t.sheetContext}>
      <Txt style={t.sheetRoute}>{tripRoute(trip).join(" → ")}</Txt>
      <Txt style={t.metaText}>{longDate(trip.departureAt)} · {clockTime(trip.departureAt)}</Txt>
    </View>
    <View style={t.tripMeta}>
      <Txt style={t.metaText}>{availableCapacity(trip)} kg available</Txt>
      <Txt style={t.metaText}>{trip.maxParcelWeightKg ?? trip.capacityKg} kg max parcel</Txt>
    </View>
    {committed ? <Notice>This trip has delivery commitments, so its route, timing, capacity, and price are locked.</Notice> : null}
    {tripOffers.length ? <View style={{ gap: primitives.space[3] }}>
      <Txt style={t.sectionLabel}>Pending carry offers ({tripOffers.length})</Txt>
      <View style={t.choiceStack}>
        {tripOffers.map(offer => {
          const parcel = snapshot?.shipments.find(s => s.id === offer.shipmentId);
          return <View key={offer.id} style={t.tripChoice}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: primitives.space[2] }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={t.choiceTitle}>{parcel ? `${parcel.origin} → ${parcel.destination}` : "Parcel offer"}</Txt>
                <Txt style={t.metaText}>{parcel ? `${parcel.weightKg} kg · ${parcel.category}` : "Pending sender review"}</Txt>
              </View>
              <Badge label={money(offer.feeNaira)} tone="green" />
            </View>
            <Button
              title="Withdraw offer"
              variant="ghost"
              disabled={offline || withdrawingId === offer.id}
              busy={withdrawingId === offer.id}
              onPress={() => void handleWithdraw(offer.id)}
            />
          </View>;
        })}
      </View>
    </View> : null}
    {!ended && !cancelling ? <View style={t.sheetActions}>
      <Button title="Edit trip" variant="lime" disabled={offline || committed} onPress={onEdit} />
      <Button title="Cancel trip" variant="ghost" disabled={offline || busy} onPress={() => setCancelling(true)} />
    </View> : null}
    {cancelling ? <View style={t.sheetActions}>
      <Field label="Cancellation reason" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Why are you cancelling this trip?" />
      <Button title="Confirm cancellation" variant="danger" busy={busy} disabled={offline || reason.trim().length < 5} onPress={() => void cancelTrip()} />
      <Button title="Keep trip" variant="secondary" disabled={busy} onPress={() => { setCancelling(false); setReason(""); setError(""); }} />
    </View> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
  </PresentationSheet>;
}

function availableCapacity(trip: Trip) {
  const reserved = trip.legReservedKg?.length ? Math.max(...trip.legReservedKg) : trip.reservedKg ?? 0;
  return Math.max(0, trip.capacityKg - reserved);
}

function tripStatus(trip: Trip, now: number): { label: string; tone: "green" | "neutral"; ended: boolean } {
  if (trip.status === "cancelled") return { label: "Cancelled", tone: "neutral", ended: true };
  if (trip.status === "completed") return { label: "Completed", tone: "neutral", ended: true };
  if (trip.departureAt <= now) return { label: "Departed", tone: "neutral", ended: true };
  return { label: "Open for parcels", tone: "green", ended: false };
}

function longDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function clockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

const t = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.background.app },
  scroll: { paddingHorizontal: primitives.space[4], paddingTop: primitives.space[7], paddingBottom: primitives.space[7] },
  listSeparator: { height: primitives.space[4] },
  title: { fontSize: primitives.typography.size.headingH1Web, lineHeight: primitives.typography.lineHeight.headingH1Web, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  titleCollapsed: { fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3 },
  nativeHeader: { minHeight: 72, justifyContent: "flex-end", paddingHorizontal: primitives.space[4], paddingBottom: primitives.space[3], backgroundColor: semantic.color.background.app, borderBottomWidth: 0 },
  nativeHeaderCollapsed: { minHeight: 52, justifyContent: "center", paddingBottom: 0, borderBottomWidth: primitives.borderWidth.sm, borderBottomColor: semantic.color.border.subtle },
  search: { minHeight: components.button.height.lg, marginTop: primitives.space[6], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  searchText: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular },
  listFooterLoading: { minHeight: 56, alignItems: "center", justifyContent: "center" },
  publishButton: { marginBottom: primitives.space[5] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: primitives.space[2], marginBottom: primitives.space[5], flexWrap: "wrap" },
  traveller: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  reference: { marginBottom: primitives.space[4], color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
  matchReason: { marginTop: primitives.space[4], color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  tripMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: primitives.space[3] },
  metaText: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
  sheetContext: { gap: components.actionSheet.compactGap },
  sheetRoute: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  sheetActions: { gap: components.actionSheet.sectionGap },
  sectionLabel: { color: semantic.color.text.primary, fontSize: primitives.typography.size.labelMd, lineHeight: primitives.typography.lineHeight.labelMd, fontFamily: fontFamily.medium },
  choiceStack: { gap: primitives.space[2] },
  tripChoice: { padding: primitives.space[4], gap: primitives.space[2], borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface },
  tripChoiceSelected: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  choiceTitle: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.medium },
  profileHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  profileStats: { flexDirection: "row", gap: primitives.space[3] },
  profileStat: { flex: 1, alignItems: "center", gap: primitives.space[1], padding: primitives.space[3], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.subtle },
  profileValue: { color: semantic.color.text.primary, fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.semibold },
  review: { gap: primitives.space[1], paddingTop: primitives.space[3], borderTopWidth: primitives.borderWidth.sm, borderTopColor: semantic.color.border.subtle },
  reviewText: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  scheduleSheet: { gap: primitives.space[4], paddingBottom: primitives.space[3] },
  scheduleSection: { gap: primitives.space[2] },
  scheduleLabel: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  scheduleInputShell: { minHeight: 64, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, flexDirection: "row", alignItems: "center", paddingHorizontal: primitives.space[4], gap: primitives.space[3] },
  scheduleInputIcon: { alignItems: "center", justifyContent: "center" },
  scheduleInput: { flex: 1, minHeight: 56, fontSize: primitives.typography.size.bodyLg, lineHeight: primitives.typography.lineHeight.bodyLg, color: semantic.color.text.primary, fontFamily: fontFamily.regular },
  scheduleSelect: { minHeight: 64, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  scheduleSelectCompact: { minHeight: 56, paddingHorizontal: primitives.space[3], gap: primitives.space[2] },
  scheduleSelectActive: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  scheduleSelectPressed: { opacity: 0.9 },
  scheduleSelectDisabled: { opacity: primitives.opacity.disabled },
  scheduleSelectText: { flex: 1, color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyLg, lineHeight: primitives.typography.lineHeight.bodyLg, fontFamily: fontFamily.regular },
  scheduleSelectTextCompact: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd },
  scheduleSelectPlaceholder: { color: semantic.color.text.tertiary },
  scheduleSelectTextDisabled: { color: semantic.color.text.tertiary },
  scheduleOptions: { gap: primitives.space[2], marginTop: primitives.space[1] },
  scheduleOption: { paddingHorizontal: primitives.space[4], paddingVertical: primitives.space[3], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  scheduleOptionActive: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  scheduleOptionText: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  scheduleRow: { flexDirection: "row", gap: primitives.space[3] },
  scheduleColumn: { flex: 1, gap: primitives.space[2] },
  schedulePickerList: { maxHeight: 296, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.subtle, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, overflow: "hidden" },
  schedulePickerScroll: { maxHeight: 296 },
  schedulePickerContent: { padding: primitives.space[2], gap: primitives.space[2] },
  schedulePickerOption: { paddingHorizontal: primitives.space[4], paddingVertical: primitives.space[3], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.subtle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  schedulePickerOptionActive: { borderColor: semantic.color.border.focus, backgroundColor: semantic.color.background.successSoft },
  schedulePickerOptionPressed: { opacity: 0.9 },
  schedulePickerOptionBody: { flex: 1, gap: primitives.space[1] },
  schedulePickerOptionTitle: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  schedulePickerOptionHint: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
  schedulePickerOptionSelected: { color: semantic.color.text.success, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  scheduleLoading: { paddingVertical: primitives.space[8], alignItems: "center", justifyContent: "center", gap: primitives.space[4] },
  scheduleLoadingText: { textAlign: "center", color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular },
  quoteRouteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: primitives.space[3] },
  quoteRouteEnd: { flex: 1, gap: primitives.space[1] },
  quoteRouteEndRight: { alignItems: "flex-end" },
  quoteRouteLabel: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular },
  quoteRouteCity: { color: semantic.color.text.primary, fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.semibold },
  quoteRouteArrow: { width: 58, height: 58, borderRadius: 29, backgroundColor: semantic.color.background.successSoft, alignItems: "center", justifyContent: "center" },
  quoteDivider: { height: 1, backgroundColor: semantic.color.border.subtle },
  quoteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quoteText: { color: semantic.color.text.primary, fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.regular },
  quoteValue: { color: semantic.color.brand.primary, fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.semibold },
  successBannerWrap: { position: "absolute", top: primitives.space[4], left: 0, right: 0, alignItems: "center", zIndex: 30, paddingHorizontal: primitives.space[4] },
  successBanner: { minHeight: 48, borderRadius: primitives.radius.pill, backgroundColor: semantic.color.brand.primary, paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  successIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: semantic.color.background.surface, alignItems: "center", justifyContent: "center" },
  successText: { color: semantic.color.text.onPrimary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
});

const calStyles = StyleSheet.create({
  card: {
    borderRadius: primitives.radius.xl,
    backgroundColor: semantic.color.background.surface,
    borderWidth: primitives.borderWidth.sm,
    borderColor: semantic.color.border.subtle,
    padding: primitives.space[4],
    gap: primitives.space[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: primitives.space[1],
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: primitives.radius.md,
    backgroundColor: semantic.color.background.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  monthTitle: {
    color: semantic.color.text.primary,
    fontSize: primitives.typography.size.bodyMd,
    fontFamily: fontFamily.semibold,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: primitives.borderWidth.sm,
    borderBottomColor: semantic.color.border.subtle,
    paddingBottom: primitives.space[2],
  },
  dayHeaderCell: {
    width: 36,
    alignItems: "center",
  },
  dayHeaderText: {
    color: semantic.color.text.tertiary,
    fontSize: primitives.typography.size.bodyXs,
    fontFamily: fontFamily.medium,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    rowGap: primitives.space[1],
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellSelected: {
    backgroundColor: semantic.color.brand.primary,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: semantic.color.brand.primary,
  },
  dayCellPressed: {
    opacity: 0.7,
  },
  dayText: {
    color: semantic.color.text.primary,
    fontSize: primitives.typography.size.bodySm,
    fontFamily: fontFamily.regular,
  },
  dayTextDisabled: {
    color: semantic.color.text.tertiary,
    opacity: 0.35,
  },
  dayTextSelected: {
    color: semantic.color.text.onPrimary,
    fontFamily: fontFamily.semibold,
  },
  dayTextToday: {
    color: semantic.color.brand.primary,
    fontFamily: fontFamily.semibold,
  },
});

const timeStyles = StyleSheet.create({
  card: {
    borderRadius: primitives.radius.xl,
    backgroundColor: semantic.color.background.surface,
    borderWidth: primitives.borderWidth.sm,
    borderColor: semantic.color.border.subtle,
    padding: primitives.space[4],
    gap: primitives.space[2],
  },
  sectionTitle: {
    color: semantic.color.text.secondary,
    fontSize: primitives.typography.size.bodyXs,
    fontFamily: fontFamily.semibold,
  },
  presetsScroll: {
    gap: primitives.space[2],
    paddingVertical: primitives.space[1],
  },
  presetChip: {
    paddingHorizontal: primitives.space[3],
    paddingVertical: primitives.space[2],
    borderRadius: primitives.radius.md,
    backgroundColor: semantic.color.background.subtle,
    borderWidth: primitives.borderWidth.sm,
    borderColor: semantic.color.border.subtle,
    alignItems: "center",
    gap: 2,
  },
  presetChipSelected: {
    backgroundColor: semantic.color.background.successSoft,
    borderColor: semantic.color.brand.primary,
  },
  presetChipLabel: {
    color: semantic.color.text.tertiary,
    fontSize: 10,
    fontFamily: fontFamily.regular,
  },
  presetChipLabelSelected: {
    color: semantic.color.brand.primary,
  },
  presetChipTime: {
    color: semantic.color.text.primary,
    fontSize: primitives.typography.size.bodySm,
    fontFamily: fontFamily.medium,
  },
  presetChipTimeSelected: {
    color: semantic.color.brand.primary,
    fontFamily: fontFamily.semibold,
  },
  periodRow: {
    flexDirection: "row",
    gap: primitives.space[2],
    marginTop: primitives.space[1],
  },
  periodBtn: {
    flex: 1,
    paddingVertical: primitives.space[2],
    borderRadius: primitives.radius.md,
    backgroundColor: semantic.color.background.subtle,
    borderWidth: primitives.borderWidth.sm,
    borderColor: semantic.color.border.subtle,
    alignItems: "center",
  },
  periodBtnActive: {
    backgroundColor: semantic.color.brand.primary,
    borderColor: semantic.color.brand.primary,
  },
  periodText: {
    color: semantic.color.text.secondary,
    fontSize: primitives.typography.size.bodySm,
    fontFamily: fontFamily.medium,
  },
  periodTextActive: {
    color: semantic.color.text.onPrimary,
    fontFamily: fontFamily.semibold,
  },
  subLabel: {
    color: semantic.color.text.tertiary,
    fontSize: 11,
    fontFamily: fontFamily.medium,
    marginTop: 4,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: primitives.radius.sm,
    backgroundColor: semantic.color.background.subtle,
    borderWidth: primitives.borderWidth.sm,
    borderColor: semantic.color.border.subtle,
    minWidth: 38,
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: semantic.color.brand.primary,
    borderColor: semantic.color.brand.primary,
  },
  pillText: {
    color: semantic.color.text.primary,
    fontSize: primitives.typography.size.bodySm,
    fontFamily: fontFamily.regular,
  },
  pillTextActive: {
    color: semantic.color.text.onPrimary,
    fontFamily: fontFamily.semibold,
  },
});
