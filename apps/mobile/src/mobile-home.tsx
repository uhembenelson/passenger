import React, { memo, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import * as Location from "expo-location";
import { usePaginatedQuery, useQuery } from "convex/react";
import { AlertCircle, Bell, ChevronRight, Headset, Search } from "lucide-react-native";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Person, Shipment, Trip } from "@passenger/core";
import { usePassengerActions, usePassengerState } from "./data";
import { BrandIllustration } from "./illustrations";
import { SupportHub, type SupportRequestContext } from "./support";
import { HandoverFlow } from "./handover-flow";
import { TripCheckIn, TripHelp } from "./trip-check-in";
import { ActiveJourneyCard } from "./active-journey-card";
import { HomeTripBackground } from "./home-trip-background";
import { FindTravellerFlow } from "./find-traveller";
import type { TravellerSearchDraft } from "./find-traveller";
import { LocationReportingStatus, ParcelTracking } from "./parcel-tracking";
import { Badge, Button, JourneyCardStack, errorMessage, fontFamily, Notice, Txt, colors } from "./ui";

type Props = {
  viewer: Person;
  navigation: React.ReactNode;
  onBookTrip: (trip: Trip, draft: TravellerSearchDraft) => void;
  onOpenNotifications: () => void;
  onSafety: () => void;
  onSendParcel?: () => void;
  onScheduleTrip?: () => void;
  onOpenDelivery?: (id: string) => void;
};

export function MobileHome({
  viewer,
  navigation,
  onBookTrip,
  onOpenNotifications,
  onSafety,
  onSendParcel,
  onScheduleTrip,
  onOpenDelivery,
}: Props) {
  const { snapshot, offline } = usePassengerState();
  const { updateParcelLocation } = usePassengerActions();
  const [handoverId, setHandoverId] = useState<string>();
  const [helpId, setHelpId] = useState<string>();
  const [checkInId, setCheckInId] = useState<string>();
  const [reportContext, setReportContext] = useState<SupportRequestContext>();
  const [trackingId, setTrackingId] = useState<string>();
  const [finding, setFinding] = useState(false);
  const [locating, setLocating] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const promotions = useQuery(api.promotions.listPublished, {});
  const { width } = useWindowDimensions();
  const promotionWidth = Math.min(340, width - 64);
  const [promotionError, setPromotionError] = useState("");
  const unreadCount = useQuery(api.notifications.unreadCount, {}) ?? 0;
  const { results: myTrips } = usePaginatedQuery(api.marketplace.myTripsPage, {}, { initialNumItems: 30 });
  const now = useMemo(() => Date.now(), [myTrips]);
  const pendingOffersByShipment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const offer of snapshot?.offers ?? []) {
      if (offer.status === "pending") counts.set(offer.shipmentId, (counts.get(offer.shipmentId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.offers]);
  const shipmentsById = useMemo(() => new Map((snapshot?.shipments ?? []).map(shipment => [shipment.id, shipment])), [snapshot?.shipments]);
  const shipmentIds = useMemo(() => new Set(shipmentsById.keys()), [shipmentsById]);
  const tripsById = useMemo(() => new Map((snapshot?.trips ?? []).map(trip => [trip.id, trip])), [snapshot?.trips]);

  // Do Now / Needs attention items
  const attentionDeliveries = useMemo(() => {
    return (snapshot?.shipments ?? [])
      .filter(shipment => {
        const sender = shipment.senderId === viewer.id;
        const traveller = shipment.travellerId === viewer.id;
        const offers = pendingOffersByShipment.get(shipment.id) ?? 0;
        return (
          shipment.status === "rejected" ||
          shipment.status === "disputed" ||
          (sender && shipment.status === "open" && offers > 0) ||
          (sender && ["matched", "funded"].includes(shipment.status)) ||
          (traveller && shipment.status === "funded")
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
  }, [pendingOffersByShipment, snapshot?.shipments, viewer.id]);

  const ongoing = useMemo(
    () =>
      (snapshot?.shipments ?? [])
        .filter(
          shipment =>
            (shipment.senderId === viewer.id || shipment.travellerId === viewer.id) &&
            shipment.status === "in_transit",
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [snapshot?.shipments, viewer.id],
  );

  const upcoming = useMemo(
    () =>
      myTrips
        .filter(
          trip =>
            trip.travellerId === viewer.id &&
            trip.status !== "cancelled" &&
            trip.status !== "completed" &&
            trip.departureAt > now,
        )
        .sort((a, b) => a.departureAt - b.departureAt)
        .slice(0, 3),
    [myTrips, viewer.id, now],
  );

  const trackedShipment = trackingId
    ? shipmentsById.get(trackingId)
    : undefined;

  const recentEvents = (snapshot?.events ?? [])
    .filter(
      event =>
        !event.shipmentId ||
        shipmentIds.has(event.shipmentId),
    )
    .slice(0, 3);

  const helpModal = helpId && shipmentsById.get(helpId) ? <TripHelp shipment={shipmentsById.get(helpId)!} onClose={() => setHelpId(undefined)} onProblem={category => { setReportContext({ kind: "delivery", id: helpId, category }); setHelpId(undefined); }} /> : null;
  if (reportContext) {
    return <SupportHub initialContext={reportContext} onClose={() => setReportContext(undefined)} onOpenDelivery={id => { setReportContext(undefined); onOpenDelivery?.(id); }} />;
  }
  if (trackedShipment) {
    return <><ParcelTracking shipment={trackedShipment} onBack={() => setTrackingId(undefined)} onProblem={() => setHelpId(trackedShipment.id)} />{helpModal}</>;
  }
  if (finding) {
    return <FindTravellerFlow onClose={() => setFinding(false)} onBookTrip={onBookTrip} />;
  }

  const updateLocation = async (shipment: Shipment) => {
    setLocating(shipment.id);
    setLocationError("");
    setLocationNotice("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          "Location permission is required to share this parcel check-in. Enable it in your device settings and try again.",
        );
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const addresses = await Location.reverseGeocodeAsync({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      const place = placeName(addresses[0], current.coords.latitude, current.coords.longitude);
      await updateParcelLocation(shipment.id, {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        place,
      });
      setLocationNotice(`Parcel location updated: ${place}.`);
    } catch (cause) {
      setLocationError(errorMessage(cause));
    } finally {
      setLocating("");
    }
  };

  return (
    <View style={h.screen}>
      {checkInId && shipmentsById.get(checkInId) ? <TripCheckIn shipment={shipmentsById.get(checkInId)!} onClose={() => setCheckInId(undefined)} onProblem={category => { setReportContext({ kind: "delivery", id: checkInId, category }); setCheckInId(undefined); }} /> : null}
      {handoverId && shipmentsById.get(handoverId) ? <HandoverFlow shipment={shipmentsById.get(handoverId)!} mode="deliver" onClose={() => setHandoverId(undefined)} /> : null}
      {helpModal}
      <HomeTripBackground />
      <ScrollView contentContainerStyle={h.scroll}>
        {offline ? (
          <Notice tone="warning">
            You're offline. Showing the latest received information; reconnect before making changes.
          </Notice>
        ) : null}

        <View style={h.headerRow}>
          <View style={{ flexShrink: 1 }}><Txt style={h.greeting}>Hi, {firstName(viewer.name)}</Txt><Txt style={{ color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 3 }}>{viewer.phoneVerificationTime && !viewer.activationDestination ? "Welcome back" : "Welcome to Passenger"}</Txt></View>
          <View style={h.headerIcons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Trust, safety and help"
              hitSlop={components.iconButton.hitSlop}
              onPress={onSafety}
              style={h.headerAction}
            >
              <Headset
                size={components.icon.size.lg}
                color={semantic.color.text.primary}
                strokeWidth={components.icon.strokeWidth.regular}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount
                  ? `${unreadCount} unread updates. Open notifications`
                  : "Open notifications"
              }
              hitSlop={components.iconButton.hitSlop}
              onPress={onOpenNotifications}
              style={h.headerAction}
            >
              <Bell
                size={components.icon.size.lg}
                color={semantic.color.text.primary}
                strokeWidth={components.icon.strokeWidth.regular}
              />
              {unreadCount ? (
                <View style={h.notificationBadge}>
                  <Txt numberOfLines={1} style={h.notificationCount}>{Math.min(99, unreadCount)}</Txt>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* Primary Action Paths: Send a parcel & I'm travelling */}
        <View style={h.primaryPathsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send a parcel"
            onPress={onSendParcel}
            style={h.primaryPathCard}
          >
            <BrandIllustration name="createParcel" size={72} style={h.primaryPathIllustration} />
            <Txt style={h.primaryPathTitle}>Send a parcel</Txt>
            <Txt style={h.primaryPathSubtitle}>Fixed rates · verified routes</Txt>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="I'm travelling"
            onPress={onScheduleTrip}
            style={h.primaryPathCard}
          >
            <BrandIllustration name="createTrip" size={72} style={h.primaryPathIllustration} />
            <Txt style={h.primaryPathTitle}>I'm travelling</Txt>
            <Txt style={h.primaryPathSubtitle}>Share space · earn extra</Txt>
          </Pressable>
        </View>

        {/* Find Traveller Search Bar */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find Traveller"
          onPress={() => setFinding(true)}
          style={h.searchShell}
        >
          <Search
            size={components.icon.size.md}
            color={semantic.color.text.tertiary}
            strokeWidth={components.icon.strokeWidth.regular}
          />
          <Txt style={h.searchCopy}>Find a traveller by route…</Txt>
        </Pressable>

        {locationError ? (
          <View style={h.locationMessage}>
            <Notice tone="error">{locationError}</Notice>
          </View>
        ) : null}
        {locationNotice ? (
          <View style={h.locationMessage}>
            <Notice tone="success">{locationNotice}</Notice>
          </View>
        ) : null}

        {/* Do Now / Needs Attention Section */}
        {attentionDeliveries.length > 0 ? (
          <View style={h.attentionSection}>
            <View style={h.attentionHeaderRow}>
              <AlertCircle size={18} color="#D97706" />
              <Txt style={h.attentionSectionTitle}>Needs your attention</Txt>
            </View>
            {attentionDeliveries.map(s => {
              const sender = s.senderId === viewer.id;
              const pendingOffers = pendingOffersByShipment.get(s.id) ?? 0;
              const label = actionSummary(s, sender, pendingOffers);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  onPress={() => {
                    if (onOpenDelivery) onOpenDelivery(s.id);
                    else onOpenNotifications();
                  }}
                  style={h.attentionCard}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt style={h.attentionRoute}>{s.origin} → {s.destination}</Txt>
                    <Txt style={h.attentionDetail}>{label.detail}</Txt>
                  </View>
                  <View style={h.attentionAction}>
                    <Txt style={h.attentionActionText}>{label.action}</Txt>
                    <ChevronRight size={16} color={semantic.color.brand.primary} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Ongoing in-transit deliveries */}
        {ongoing.length ? (
          <>
            <Txt style={h.sectionTitle}>
              {ongoing.length === 1 ? "Active delivery" : "Active deliveries"}
            </Txt>
            <JourneyCardStack>
              {ongoing.map(shipment => {
                const linkedTrip = shipment.tripId
                  ? tripsById.get(shipment.tripId)
                  : undefined;
                const carryingParcel = shipment.travellerId === viewer.id;
                const sentByViewer =
                  shipment.senderId === viewer.id && shipment.travellerId !== viewer.id;
                return (
                  <JourneyCard
                    key={shipment.id}
                    trip={journeyFromShipment(shipment, linkedTrip)}
                    shipment={shipment}
                    onReport={() => setHelpId(shipment.id)}
                    viewerRole={
                      carryingParcel ? "traveller" : sentByViewer ? "sender" : undefined
                    }
                    action={
                      carryingParcel
                        ? "Check in"
                        : sentByViewer
                          ? "Track parcel"
                          : undefined
                    }
                    onLocation={carryingParcel ? () => void updateLocation(shipment) : undefined}
                    locationBusy={locating === shipment.id}
                    onDeliver={carryingParcel ? () => setHandoverId(shipment.id) : undefined}
                    onAction={
                      carryingParcel
                        ? () => setCheckInId(shipment.id)
                        : sentByViewer
                          ? () => setTrackingId(shipment.id)
                          : undefined
                    }
                  />
                );
              })}
            </JourneyCardStack>
          </>
        ) : null}

        {/* Upcoming published trips */}
        {upcoming.length ? (
          <>
            <Txt style={h.sectionTitle}>
              {upcoming.length === 1 ? "Upcoming Trip" : "Upcoming Trips"}
            </Txt>
            <JourneyCardStack>
              {upcoming.map(trip => (
                <JourneyCard key={trip.id} trip={trip} onReport={() => setReportContext({ kind: "trip", id: trip.id })} />
              ))}
            </JourneyCardStack>
          </>
        ) : null}

        {promotions?.length ? (
          <View style={h.promotions}>
            <Txt style={h.promotionHeading}>For your next journey</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={promotionWidth + 12} decelerationRate="fast" contentContainerStyle={h.promotionList}>
              {promotions.map(promotion => (
                <Pressable key={promotion._id} accessibilityRole="button" accessibilityLabel={promotion.title}
                  style={[h.promotionCard, { width: promotionWidth, backgroundColor: promotion.backgroundColor }]}
                  onPress={() => {
                    setPromotionError("");
                    switch (promotion.destination) {
                      case "send": onSendParcel?.(); break;
                      case "travel": onScheduleTrip?.(); break;
                      case "find": setFinding(true); break;
                      case "safety": onSafety(); break;
                      case "activity": onOpenNotifications(); break;
                      case "external": void Linking.openURL(promotion.externalUrl).catch(() => setPromotionError("Could not open this link. Please try again.")); break;
                    }
                  }}>
                  {promotion.imageUrl ? <Image source={{ uri: promotion.imageUrl }} resizeMode="cover" style={h.promotionImage} accessible={false} /> : null}
                  {!promotion.imageOnly ? <View style={[h.promotionCopy, promotion.imageUrl ? { backgroundColor: promotion.backgroundColor } : undefined]}>
                    <Txt style={[h.promotionTitle, { color: promotion.textColor }]}>{promotion.title}</Txt>
                    {promotion.body ? <Txt style={{ color: promotion.textColor }}>{promotion.body}</Txt> : null}
                    <Txt style={[h.promotionLink, { color: promotion.textColor }]}>Explore →</Txt>
                  </View> : null}
                </Pressable>
              ))}
            </ScrollView>
            {promotionError ? <Notice tone="error">{promotionError}</Notice> : null}
          </View>
        ) : null}

        {/* Recent activity */}
        <Txt style={h.sectionTitle}>Recent activity</Txt>
        {recentEvents.length ? (
          <View style={h.activityList}>
            {recentEvents.map(event => (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                onPress={onOpenNotifications}
                style={h.activityItem}
              >
                <Txt numberOfLines={1} style={h.activityTitle}>
                  {event.detail}
                </Txt>
                <Txt style={h.activityTime}>
                  {new Date(event.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Txt>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={h.activityEmpty}>
            <BrandIllustration name="routesEmpty" size={76} />
            <View style={h.activityEmptyCopy}>
              <Txt style={h.activityEmptyTitle}>No updates yet</Txt>
              <Txt style={h.activityEmptyDetail}>
                Your parcel and trip updates will appear here.
              </Txt>
            </View>
          </View>
        )}
      </ScrollView>
      {navigation}
    </View>
  );
}

function actionSummary(s: Shipment, sender: boolean, pendingOffers: number) {
  if (s.status === "rejected") return { action: "Fix & resubmit", detail: s.reviewNote || "Review changes requested." };
  if (s.status === "open" && pendingOffers > 0) return { action: "Review offers", detail: `${pendingOffers} carry offer${pendingOffers === 1 ? "" : "s"} waiting.` };
  if (s.status === "matched") return sender ? { action: "Pay now", detail: "Awaiting sender payment." } : { action: "Waiting", detail: "Waiting for payment." };
  if (s.status === "funded") return sender ? { action: "Hand over parcel", detail: "Meet your traveller to hand over." } : { action: "Receive parcel", detail: "Meet the sender to collect." };
  if (s.status === "disputed") return { action: "View dispute", detail: "Under review by support." };
  return { action: "View details", detail: "Action needed." };
}

const JourneyCard = memo(function JourneyCard({
  trip,
  shipment,
  viewerRole,
  action,
  busy,
  onAction,
  onReport,
  onLocation,
  locationBusy,
  onDeliver,
}: {
  trip: Pick<Trip, "origin" | "destination" | "departureAt">;
  shipment?: Shipment;
  viewerRole?: "traveller" | "sender";
  action?: string;
  busy?: boolean;
  onAction?: () => void;
  onReport: () => void;
  onLocation?: () => void;
  locationBusy?: boolean;
  onDeliver?: () => void;
}) {
  const cardAction =
    action && onAction
      ? { title: busy ? "Getting current location…" : action, busy, onPress: onAction }
      : undefined;
  return (
    <ActiveJourneyCard
      ongoing={Boolean(shipment)}
      origin={trip.origin}
      destination={trip.destination}
      date={longDate(trip.departureAt)}
      time={clockTime(trip.departureAt)}
      action={cardAction}
      onReport={onReport}
    >
      {shipment?.latestSafetyCheckInAt ? <Txt style={{ fontSize: 12, color: colors.muted }}>Safe and sound · {longDate(shipment.latestSafetyCheckInAt)}, {clockTime(shipment.latestSafetyCheckInAt)}</Txt> : null}
      {onDeliver ? <Button title="Hand over to receiver" variant="secondary" onPress={onDeliver} /> : null}
      {onLocation ? <Button title="Share parcel location" small variant="ghost" busy={locationBusy} onPress={onLocation} /> : null}
      {shipment && viewerRole ? (
        <LocationReportingStatus shipment={shipment} viewerRole={viewerRole} compact />
      ) : null}
    </ActiveJourneyCard>
  );
});

function journeyFromShipment(
  shipment: Shipment,
  trip?: Trip,
): Pick<Trip, "origin" | "destination" | "departureAt"> {
  return {
    origin: trip?.origin ?? shipment.origin,
    destination: trip?.destination ?? shipment.destination,
    departureAt: trip?.departureAt ?? shipment.handoverAt ?? shipment.updatedAt,
  };
}

function placeName(
  address: Location.LocationGeocodedAddress | undefined,
  latitude: number,
  longitude: number,
) {
  if (!address) return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  const parts = [
    address.name,
    address.district,
    address.city,
    address.subregion,
    address.region,
    address.country,
  ].filter((part): part is string => !!part?.trim());
  return [...new Set(parts)].join(", ") || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function longDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function clockTime(timestamp: number) {
  return new Date(timestamp)
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

const h = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.background.app },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: primitives.space[4],
    paddingTop: primitives.space[5],
    paddingBottom: primitives.space[8],
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: primitives.space[5],
  },
  greeting: {
    fontSize: primitives.typography.size.headingH3,
    lineHeight: primitives.typography.lineHeight.headingH3,
    fontFamily: fontFamily.semibold,
    color: semantic.color.text.primary,
  },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: primitives.space[5] },
  headerAction: {
    minWidth: components.iconButton.size,
    minHeight: components.iconButton.size,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: primitives.radius.pill,
    backgroundColor: semantic.color.brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCount: {
    color: semantic.color.text.onPrimary,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: fontFamily.semibold,
  },
  primaryPathsRow: {
    flexDirection: "row",
    gap: primitives.space[3],
    marginBottom: primitives.space[4],
  },
  primaryPathCard: {
    flex: 1,
    padding: primitives.space[4],
    borderRadius: primitives.radius.lg,
    backgroundColor: semantic.color.background.surface,
    borderWidth: 1,
    borderColor: semantic.color.border.subtle,
    gap: primitives.space[1],
  },
  primaryPathIllustration: { marginBottom: primitives.space[2] },
  primaryPathTitle: {
    fontSize: primitives.typography.size.bodyMd,
    lineHeight: primitives.typography.lineHeight.bodyMd,
    fontFamily: fontFamily.semibold,
    color: semantic.color.text.primary,
  },
  primaryPathSubtitle: {
    fontSize: primitives.typography.size.bodyXs,
    lineHeight: primitives.typography.lineHeight.bodyXs,
    fontFamily: fontFamily.regular,
    color: semantic.color.text.tertiary,
  },
  searchShell: {
    minHeight: components.button.height.lg,
    borderRadius: primitives.radius.lg,
    backgroundColor: semantic.color.background.surface,
    paddingHorizontal: primitives.space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: primitives.space[3],
  },
  searchCopy: {
    fontSize: primitives.typography.size.bodyMd,
    lineHeight: primitives.typography.lineHeight.bodyMd,
    color: semantic.color.text.tertiary,
    fontFamily: fontFamily.regular,
  },
  locationMessage: { marginTop: primitives.space[4] },
  attentionSection: {
    marginTop: primitives.space[6],
    padding: primitives.space[4],
    borderRadius: primitives.radius.lg,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    gap: primitives.space[3],
  },
  attentionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: primitives.space[2],
  },
  attentionSectionTitle: {
    fontSize: primitives.typography.size.bodySm,
    lineHeight: primitives.typography.lineHeight.bodySm,
    fontFamily: fontFamily.semibold,
    color: "#92400E",
  },
  attentionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: primitives.space[3],
    backgroundColor: "white",
    borderRadius: primitives.radius.md,
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  attentionRoute: {
    fontSize: primitives.typography.size.bodySm,
    lineHeight: primitives.typography.lineHeight.bodySm,
    fontFamily: fontFamily.semibold,
    color: semantic.color.text.primary,
  },
  attentionDetail: {
    fontSize: primitives.typography.size.bodyXs,
    lineHeight: primitives.typography.lineHeight.bodyXs,
    fontFamily: fontFamily.regular,
    color: semantic.color.text.secondary,
  },
  attentionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: primitives.space[1],
  },
  attentionActionText: {
    fontSize: primitives.typography.size.bodyXs,
    lineHeight: primitives.typography.lineHeight.bodyXs,
    fontFamily: fontFamily.semibold,
    color: semantic.color.brand.primary,
  },
  promotions: { marginTop: primitives.space[6], gap: 12 },
  promotionHeading: { fontFamily: fontFamily.semibold, fontSize: 18, color: semantic.color.text.primary },
  promotionList: { gap: 12 },
  promotionCard: { minHeight: 190, borderRadius: 20, overflow: "hidden", justifyContent: "flex-end" },
  promotionImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  promotionCopy: { margin: 16, padding: 12, borderRadius: 12, gap: 8 },
  promotionTitle: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold },
  promotionLink: { marginTop: 4, fontFamily: fontFamily.semibold },
  sectionTitle: {
    marginTop: primitives.space[8],
    marginBottom: primitives.space[5],
    fontSize: primitives.typography.size.headingH3,
    lineHeight: primitives.typography.lineHeight.headingH3,
    color: semantic.color.text.primary,
    fontFamily: fontFamily.semibold,
  },
  activityList: { gap: primitives.space[2] },
  activityEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: primitives.space[4],
    padding: primitives.space[5],
    borderRadius: primitives.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.border.subtle,
    backgroundColor: semantic.color.background.surface,
  },
  activityEmptyCopy: { flex: 1, gap: primitives.space[1] },
  activityEmptyTitle: {
    color: semantic.color.text.primary,
    fontSize: primitives.typography.size.bodyMd,
    lineHeight: primitives.typography.lineHeight.bodyMd,
    fontFamily: fontFamily.semibold,
  },
  activityEmptyDetail: {
    color: semantic.color.text.tertiary,
    fontSize: primitives.typography.size.bodySm,
    lineHeight: primitives.typography.lineHeight.bodySm,
    fontFamily: fontFamily.regular,
  },
  activityItem: {
    padding: primitives.space[4],
    borderRadius: primitives.radius.lg,
    backgroundColor: semantic.color.background.surface,
    gap: primitives.space[1],
  },
  activityTitle: {
    color: semantic.color.text.primary,
    fontSize: primitives.typography.size.bodySm,
    lineHeight: primitives.typography.lineHeight.bodySm,
    fontFamily: fontFamily.medium,
  },
  activityTime: {
    color: semantic.color.text.tertiary,
    fontSize: primitives.typography.size.bodyXs,
    lineHeight: primitives.typography.lineHeight.bodyXs,
    fontFamily: fontFamily.regular,
  },
});
