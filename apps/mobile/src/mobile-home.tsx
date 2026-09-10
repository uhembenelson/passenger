import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { Bell, Headset, Search } from "lucide-react-native";
import { components, primitives, semantic } from "@passenger/design-tokens";
import type { Person, Shipment, Trip } from "@passenger/core";
import { usePassenger } from "./data";
import { FindTravellerFlow } from "./find-traveller";
import type { TravellerSearchDraft } from "./find-traveller";
import { LocationReportingStatus, ParcelTracking } from "./parcel-tracking";
import { JourneyCardStack, JourneyRouteCard, errorMessage, fontFamily, Notice, Txt } from "./ui";

type Props = {
  viewer: Person;
  navigation: React.ReactNode;
  onBookTrip: (trip: Trip, draft: TravellerSearchDraft) => void;
  onOpenMilestones: () => void;
  onSafety: () => void;
};

export function MobileHome({ viewer, navigation, onBookTrip, onOpenMilestones, onSafety }: Props) {
  const data = usePassenger();
  const { snapshot } = data;
  const [trackingId, setTrackingId] = useState<string>();
  const [finding, setFinding] = useState(false);
  const [locating, setLocating] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const now = Date.now();
  const ongoing = useMemo(() => snapshot!.shipments
    .filter(shipment => (shipment.senderId === viewer.id || shipment.travellerId === viewer.id) && shipment.status === "in_transit")
    .sort((a, b) => b.updatedAt - a.updatedAt), [snapshot, viewer.id]);
  const upcoming = useMemo(() => snapshot!.trips
    .filter(trip => trip.travellerId === viewer.id && trip.status !== "cancelled" && trip.status !== "completed" && trip.departureAt > now)
    .sort((a, b) => a.departureAt - b.departureAt), [snapshot, viewer.id, now]);
  const trackedShipment = trackingId ? snapshot!.shipments.find(shipment => shipment.id === trackingId) : undefined;
  const recentEvents = snapshot!.events
    .filter(event => !event.shipmentId || snapshot!.shipments.some(shipment => shipment.id === event.shipmentId))
    .slice(0, 3);
  const unreadCount = snapshot!.notifications?.filter(notification => !notification.readAt).length ?? 0;

  if (trackedShipment) return <ParcelTracking shipment={trackedShipment} onBack={() => setTrackingId(undefined)} />;
  if (finding) return <FindTravellerFlow onClose={() => setFinding(false)} onBookTrip={onBookTrip} />;

  const updateLocation = async (shipment: Shipment) => {
    setLocating(shipment.id);
    setLocationError("");
    setLocationNotice("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission is required to share this parcel check-in. Enable it in your device settings and try again.");
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const addresses = await Location.reverseGeocodeAsync({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      const place = placeName(addresses[0], current.coords.latitude, current.coords.longitude);
      await data.updateParcelLocation(shipment.id, { latitude: current.coords.latitude, longitude: current.coords.longitude, place });
      setLocationNotice(`Parcel location updated: ${place}.`);
    } catch (cause) {
      setLocationError(errorMessage(cause));
    } finally {
      setLocating("");
    }
  };

  return <View style={h.screen}>
    <ScrollView contentContainerStyle={h.scroll}>
      {data.offline ? <Notice tone="warning">You're offline. Showing the latest received information; reconnect before making changes.</Notice> : null}
      <View style={h.headerRow}>
        <Txt style={h.greeting}>Hi, {firstName(viewer.name)}</Txt>
        <View style={h.headerIcons}>
          <Pressable accessibilityRole="button" accessibilityLabel="Trust, safety and help" hitSlop={components.iconButton.hitSlop} onPress={onSafety} style={h.headerAction}><Headset size={components.icon.size.lg} color={semantic.color.text.primary} strokeWidth={components.icon.strokeWidth.regular} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={unreadCount ? `${unreadCount} unread updates. Open milestones` : "Open milestones"} hitSlop={components.iconButton.hitSlop} onPress={onOpenMilestones} style={h.headerAction}><Bell size={components.icon.size.lg} color={semantic.color.text.primary} strokeWidth={components.icon.strokeWidth.regular} />{unreadCount ? <View style={h.notificationBadge}><Txt style={h.notificationCount}>{Math.min(99, unreadCount)}</Txt></View> : null}</Pressable>
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Find Traveler" onPress={() => setFinding(true)} style={h.searchShell}>
        <Search size={components.icon.size.md} color={semantic.color.text.tertiary} strokeWidth={components.icon.strokeWidth.regular} />
        <Txt style={h.searchCopy}>Find Traveler</Txt>
      </Pressable>

      {locationError ? <View style={h.locationMessage}><Notice tone="error">{locationError}</Notice></View> : null}
      {locationNotice ? <View style={h.locationMessage}><Notice tone="success">{locationNotice}</Notice></View> : null}

      {ongoing.length ? <>
        <Txt style={h.sectionTitle}>{ongoing.length === 1 ? "Ongoing Trip" : "Ongoing Trips"}</Txt>
        <JourneyCardStack>{ongoing.map(shipment => {
          const linkedTrip = shipment.tripId ? snapshot!.trips.find(trip => trip.id === shipment.tripId) : undefined;
          const carryingParcel = shipment.travellerId === viewer.id;
          const sentByViewer = shipment.senderId === viewer.id && shipment.travellerId !== viewer.id;
          return <JourneyCard key={shipment.id} trip={journeyFromShipment(shipment, linkedTrip)} shipment={shipment} viewerRole={carryingParcel ? "traveller" : sentByViewer ? "sender" : undefined} action={carryingParcel ? "Update parcel location" : sentByViewer ? "Track parcel" : undefined} busy={locating === shipment.id} onAction={carryingParcel ? () => void updateLocation(shipment) : sentByViewer ? () => setTrackingId(shipment.id) : undefined} />;
        })}</JourneyCardStack>
      </> : null}

      {upcoming.length ? <>
        <Txt style={h.sectionTitle}>{upcoming.length === 1 ? "Upcoming Trip" : "Upcoming Trips"}</Txt>
        <JourneyCardStack>{upcoming.map(trip => <JourneyCard key={trip.id} trip={trip} />)}</JourneyCardStack>
      </> : null}

      <Txt style={h.sectionTitle}>Recent activity</Txt>
      {recentEvents.length ? <View style={h.activityList}>{recentEvents.map(event => <Pressable key={event.id} accessibilityRole="button" onPress={onOpenMilestones} style={h.activityItem}><Txt numberOfLines={1} style={h.activityTitle}>{event.detail}</Txt><Txt style={h.activityTime}>{new Date(event.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Txt></Pressable>)}</View> : <Notice>No delivery activity yet. Your confirmed parcel and trip milestones will appear here.</Notice>}
    </ScrollView>
    {navigation}
  </View>;
}

function JourneyCard({ trip, shipment, viewerRole, action, busy, onAction }: { trip: Pick<Trip, "origin" | "destination" | "departureAt">; shipment?: Shipment; viewerRole?: "traveller" | "sender"; action?: string; busy?: boolean; onAction?: () => void }) {
  const cardAction = action && onAction ? { title: busy ? "Getting current location…" : action, busy, onPress: onAction } : undefined;
  return <JourneyRouteCard origin={trip.origin} destination={trip.destination} date={longDate(trip.departureAt)} time={clockTime(trip.departureAt)} action={cardAction}>
    {shipment && viewerRole ? <LocationReportingStatus shipment={shipment} viewerRole={viewerRole} compact /> : null}
  </JourneyRouteCard>;
}

function journeyFromShipment(shipment: Shipment, trip?: Trip): Pick<Trip, "origin" | "destination" | "departureAt"> {
  return { origin: trip?.origin ?? shipment.origin, destination: trip?.destination ?? shipment.destination, departureAt: trip?.departureAt ?? shipment.handoverAt ?? shipment.updatedAt };
}
function placeName(address: Location.LocationGeocodedAddress | undefined, latitude: number, longitude: number) {
  if (!address) return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  const parts = [address.name, address.district, address.city, address.subregion, address.region, address.country].filter((part): part is string => !!part?.trim());
  return [...new Set(parts)].join(", ") || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
function firstName(name: string) { return name.trim().split(/\s+/)[0] || "there"; }
function longDate(timestamp: number) { return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
function clockTime(timestamp: number) { return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase(); }

const h = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.color.background.app },
  scroll: { flexGrow: 1, paddingHorizontal: primitives.space[4], paddingTop: primitives.space[5], paddingBottom: primitives.space[8] },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: primitives.space[6] },
  greeting: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular, color: semantic.color.text.primary },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: primitives.space[5] },
  headerAction: { minWidth: components.iconButton.size, minHeight: components.iconButton.size, alignItems: "center", justifyContent: "center" },
  notificationBadge: { position: "absolute", top: 0, right: 0, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: primitives.radius.pill, backgroundColor: semantic.color.brand.primary, alignItems: "center", justifyContent: "center" },
  notificationCount: { color: semantic.color.text.onPrimary, fontSize: 9, lineHeight: 12, fontFamily: fontFamily.semibold },
  searchShell: { minHeight: components.button.height.lg, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  searchCopy: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  locationMessage: { marginTop: primitives.space[4] },
  sectionTitle: { marginTop: primitives.space[8], marginBottom: primitives.space[5], fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  activityList: { gap: primitives.space[2] },
  activityItem: { padding: primitives.space[4], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, gap: primitives.space[1] },
  activityTitle: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.medium },
  activityTime: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
});
