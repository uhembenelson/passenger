import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, MapPin, Search } from "lucide-react-native";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { findMatchingTrips, matchExplanation, money, tripRoute } from "@passenger/core";
import type { CreateTripInput, Shipment, Trip } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { FindTravellerFlow } from "./find-traveller";
import type { TravellerSearchDraft } from "./find-traveller";
import { TripForm } from "./forms";
import { DraggableFAB } from "./draggable-fab";
import { Badge, Button, Empty, errorMessage, Field, JourneyCardStack, JourneyRouteCard, Notice, PresentationSheet, Txt, colors, fontFamily } from "./ui";

type TripTab = "available" | "parcels" | "mine";

type Props = {
  navigation: React.ReactNode;
  initialTab?: TripTab;
  notice?: string;
  onBookTrip: (trip: Trip, draft?: TravellerSearchDraft) => void;
  requestOpenScheduleTrip?: boolean;
  onScheduleTripFlowHandled?: () => void;
};

const tabs: { id: TripTab; label: string }[] = [
  { id: "available", label: "Available" },
  { id: "parcels", label: "Carry parcels" },
  { id: "mine", label: "My trips" },
];

const scheduleTemplates = [
  { id: "small-envelope", label: "Small Envelope", category: "Documents", weightKg: 0.5 },
  { id: "luggage", label: "Luggage", category: "Other", weightKg: 12 },
] as const;

const fallbackServiceArea = { baseLocation: "Jos", destinations: ["Abuja", "Kaduna", "Lagos"] };

export function MobileTripsScreen({ navigation, initialTab = "available", notice, onBookTrip, requestOpenScheduleTrip = false, onScheduleTripFlowHandled }: Props) {
  const data = usePassenger();
  const { snapshot, offline } = data;
  const viewer = snapshot!.viewer!;
  const serviceArea = snapshot!.serviceArea ?? fallbackServiceArea;
  const baseLocation = serviceArea.baseLocation;
  const destinations = serviceArea.destinations;
  const allLocations = useMemo(() => [baseLocation, ...destinations], [baseLocation, destinations]);
  const [tab, setTab] = useState<TripTab>(initialTab);
  const [finding, setFinding] = useState(false);
  const [selected, setSelected] = useState<Trip>();
  const [selectedTravellerTrip, setSelectedTravellerTrip] = useState<Trip>();
  const [selectedParcel, setSelectedParcel] = useState<Shipment>();
  const [editing, setEditing] = useState<Trip>();
  const [scheduleStage, setScheduleStage] = useState<"closed" | "form" | "submitting">("closed");
  const [origin, setOrigin] = useState(baseLocation);
  const [destination, setDestination] = useState(destinations[0] ?? "");
  const [originOpen, setOriginOpen] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [template, setTemplate] = useState<(typeof scheduleTemplates)[number]>(scheduleTemplates[0]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [parcelTypeOpen, setParcelTypeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<"date" | "time" | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const now = Date.now();
  const available = useMemo(() => snapshot!.trips
    .filter(trip => trip.travellerId !== viewer.id && trip.verified && trip.status !== "cancelled" && trip.status !== "completed" && trip.departureAt > now && availableCapacity(trip) > 0)
    .sort((a, b) => a.departureAt - b.departureAt), [snapshot, viewer.id, now]);
  const mine = useMemo(() => snapshot!.trips
    .filter(trip => trip.travellerId === viewer.id)
    .sort((a, b) => b.departureAt - a.departureAt), [snapshot, viewer.id]);
  const parcelMatches = useMemo(() => snapshot!.shipments
    .filter(parcel => parcel.senderId !== viewer.id && parcel.status === "open" && mine.some(trip => findMatchingTrips(parcel, [trip], now).length > 0))
    .sort((a, b) => (a.preferredPickupAt ?? a.readyAt ?? a.updatedAt) - (b.preferredPickupAt ?? b.readyAt ?? b.updatedAt)), [snapshot, viewer.id, mine, now]);
  const groups = { available, parcels: parcelMatches, mine };
  const visible = groups[tab];

  const resetScheduleForm = () => {
    setOrigin(baseLocation);
    setDestination(destinations[0] ?? "");
    setTemplate(scheduleTemplates[0]);
    setDate("");
    setTime("");
    setOriginOpen(false);
    setDestinationOpen(false);
    setParcelTypeOpen(false);
    setPickerOpen(null);
    setScheduleError("");
  };

  const handleSelectOrigin = (loc: string) => {
    setOrigin(loc);
    setOriginOpen(false);
    setScheduleError("");
    if (loc !== baseLocation) {
      setDestination(baseLocation);
    } else if (destination === baseLocation || !destination) {
      setDestination(destinations[0] ?? "");
    }
  };

  const handleSelectDestination = (loc: string) => {
    setDestination(loc);
    setDestinationOpen(false);
    setScheduleError("");
    if (loc !== baseLocation) {
      setOrigin(baseLocation);
    } else if (origin === baseLocation || !origin) {
      setOrigin(destinations[0] ?? "");
    }
  };

  const swapRoute = () => {
    const tempOrigin = origin;
    setOrigin(destination);
    setDestination(tempOrigin);
    setScheduleError("");
  };

  const openScheduleSheet = () => {
    resetScheduleForm();
    setScheduleStage("form");
    onScheduleTripFlowHandled?.();
  };

  React.useEffect(() => {
    if (requestOpenScheduleTrip) openScheduleSheet();
  }, [requestOpenScheduleTrip]);

  const scheduleTrip = async () => {
    if (!isScheduleReady(origin, destination, date, time)) {
      setScheduleError("Choose the route, parcel type, date, and time first.");
      return;
    }
    if (!isServiceRoute(origin, destination, serviceArea)) {
      setScheduleError(`Trips currently need to start or end in ${serviceArea.baseLocation}.`);
      return;
    }
    setScheduleError("");
    setOriginOpen(false);
    setDestinationOpen(false);
    setParcelTypeOpen(false);
    setScheduleStage("submitting");
    try {
      const departureAt = parseScheduleDateTime(date, time);
      const input: CreateTripInput = {
        origin: origin.trim(),
        destination: destination.trim(),
        stops: [],
        departureAt,
        arrivalAt: departureAt + estimateTripDurationMs(origin, destination),
        capacityKg: template.weightKg,
        acceptedCategories: [template.category],
        maxParcelWeightKg: template.weightKg,
        handlingNotes: template.label,
      };
      await data.createTrip(input);
      setTab("mine");
      resetScheduleForm();
      setScheduleStage("closed");
      setLocalNotice("Trip scheduled successfully.");
      onScheduleTripFlowHandled?.();
    } catch (cause) {
      setScheduleError(errorMessage(cause));
      setScheduleStage("form");
    }
  };

  if (finding) return <FindTravellerFlow onClose={() => setFinding(false)} onBookTrip={(trip, draft) => onBookTrip(trip, draft)} />;

  return <View style={t.screen}>
    {localNotice ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss trip success message" onPress={() => setLocalNotice("")} style={t.successBannerWrap}><View style={t.successBanner}><View style={t.successIcon}><Check size={18} color="#34C97B" strokeWidth={3} /></View><Txt style={t.successText}>{localNotice}</Txt></View></Pressable> : null}
    <ScrollView contentContainerStyle={t.scroll}>
      <Txt style={t.title}>Upcoming Trips</Txt>
      {offline ? <Notice tone="warning">You're offline. Trip and parcel actions will be available again after you reconnect.</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Find a trip" onPress={() => setFinding(true)} style={t.search}>
        <Search size={components.icon.size.md} color={semantic.color.text.tertiary} strokeWidth={components.icon.strokeWidth.regular} />
        <Txt style={t.searchText}>Find a trip</Txt>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={t.tabsRow}>
        {tabs.map(item => {
          const active = item.id === tab;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.id)} style={t.tabButton}>
            <View style={t.tabLabelRow}>
              <Txt style={[t.tabLabel, active && t.tabLabelActive]}>{item.label}</Txt>
              <View style={[t.tabCount, active && t.tabCountActive]}><Txt style={[t.tabCountText, active && t.tabCountTextActive]}>{groups[item.id].length}</Txt></View>
            </View>
            {active ? <View style={t.tabUnderline} /> : null}
          </Pressable>;
        })}
      </ScrollView>

      {tab === "mine" ? <Button title="Publish a trip" variant="lime" onPress={openScheduleSheet} style={t.publishButton} /> : null}

      {tab === "parcels" && parcelMatches.length ? <JourneyCardStack>{parcelMatches.map(parcel => {
        const matchingTrips = findMatchingTrips(parcel, mine, now);
        const closest = matchingTrips[0]!;
        return <JourneyRouteCard
          key={parcel.id}
          origin={parcel.origin}
          destination={parcel.destination}
          date={longDate(parcel.preferredPickupAt ?? parcel.readyAt ?? parcel.updatedAt)}
          time={clockTime(parcel.preferredPickupAt ?? parcel.readyAt ?? parcel.updatedAt)}
          header={<View style={t.cardHeader}><Badge label={parcel.category} tone="neutral" /><Txt style={t.traveller}>{parcel.senderName}</Txt></View>}
          detail={<Txt style={t.reference}>{parcel.weightKg} kg · {money(parcel.feeNaira)} offered</Txt>}
          action={{ title: "Offer to carry", onPress: () => setSelectedParcel(parcel) }}
        ><Txt style={t.matchReason}>{matchExplanation(parcel, closest)}</Txt></JourneyRouteCard>;
      })}</JourneyCardStack> : tab !== "parcels" && visible.length ? <JourneyCardStack>{(visible as Trip[]).map(trip => {
        const mineTrip = trip.travellerId === viewer.id;
        const status = tripStatus(trip, now);
        return <JourneyRouteCard
          key={trip.id}
          origin={trip.origin}
          destination={trip.destination}
          date={longDate(trip.departureAt)}
          time={clockTime(trip.departureAt)}
          header={<View style={t.cardHeader}>
            <Badge label={mineTrip ? status.label : "Verified traveller"} tone={status.tone} />
            <Txt style={t.traveller}>{mineTrip ? "Your trip" : trip.travellerName}</Txt>
          </View>}
          detail={<Txt style={t.reference}>{trip.stops?.length ? `Via ${trip.stops.join(" · ")}` : "Direct trip"}</Txt>}
          action={{ title: mineTrip ? status.ended ? "View trip" : "Manage trip" : "View traveller", onPress: () => mineTrip ? setSelected(trip) : setSelectedTravellerTrip(trip) }}
        >
          <View style={t.tripMeta}>
            <Txt style={t.metaText}>{availableCapacity(trip)} kg available</Txt>
            <Txt style={t.metaText}>{trip.maxParcelWeightKg ?? trip.capacityKg} kg max parcel</Txt>
          </View>
        </JourneyRouteCard>;
      })}</JourneyCardStack> : <Empty
        title={tab === "available" ? "No available trips yet." : tab === "parcels" ? "No parcels fit your trips yet." : "You haven't published a trip."}
        detail={tab === "available" ? "Try another route or check back soon." : tab === "parcels" ? "Publish a trip or check again when new parcels are approved." : "Share where you're already going and the space you can carry."}
        action={tab === "available" ? "Search another route" : "Publish a trip"}
        onAction={tab === "available" ? () => setFinding(true) : openScheduleSheet}
      />}
    </ScrollView>
    <DraggableFAB onPress={openScheduleSheet} />
    {navigation}
    {selected ? <ManageTripSheet trip={selected} onClose={() => setSelected(undefined)} onEdit={() => { setSelected(undefined); setEditing(selected); }} /> : null}
    {selectedTravellerTrip ? <TravellerTripSheet trip={selectedTravellerTrip} onClose={() => setSelectedTravellerTrip(undefined)} onContinue={() => onBookTrip(selectedTravellerTrip)} /> : null}
    {selectedParcel ? <CarryOfferSheet parcel={selectedParcel} trips={findMatchingTrips(selectedParcel, mine, now)} onClose={() => setSelectedParcel(undefined)} /> : null}
    {editing ? <TripForm trip={editing} onClose={() => setEditing(undefined)} onSuccess={() => setEditing(undefined)} /> : null}
    {scheduleStage === "form" ? <PresentationSheet title="Schedule Trip" onClose={() => { setOriginOpen(false); setDestinationOpen(false); setParcelTypeOpen(false); setPickerOpen(null); setScheduleStage("closed"); onScheduleTripFlowHandled?.(); }}>
      <View style={t.scheduleSheet}>
        <LocationDropdown
          label="From"
          value={origin}
          placeholder="Select departure city"
          isOpen={originOpen}
          onToggle={() => {
            setDestinationOpen(false);
            setParcelTypeOpen(false);
            setPickerOpen(null);
            setOriginOpen(curr => !curr);
          }}
          options={allLocations}
          onSelect={handleSelectOrigin}
          baseLocation={baseLocation}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: -6, marginBottom: -6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap origin and destination"
            onPress={swapRoute}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 8, opacity: pressed ? 0.7 : 1 }]}
          >
            <Txt style={{ color: semantic.color.brand.primary, fontSize: 13, fontFamily: fontFamily.medium }}>⇄ Swap route</Txt>
          </Pressable>
        </View>
        <LocationDropdown
          label="To"
          value={destination}
          placeholder="Select destination city"
          isOpen={destinationOpen}
          onToggle={() => {
            setOriginOpen(false);
            setParcelTypeOpen(false);
            setPickerOpen(null);
            setDestinationOpen(curr => !curr);
          }}
          options={allLocations}
          onSelect={handleSelectDestination}
          baseLocation={baseLocation}
        />
        <View style={t.scheduleSection}>
          <Txt style={t.scheduleLabel}>Parcel Type</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose parcel type" onPress={() => { setOriginOpen(false); setDestinationOpen(false); setPickerOpen(null); setParcelTypeOpen(value => !value); }} style={[t.scheduleSelect, parcelTypeOpen && t.scheduleSelectActive]}>
            <Txt style={t.scheduleSelectText}>{template.label}</Txt>
            <ChevronDown size={22} color={colors.text} strokeWidth={2} />
          </Pressable>
          {parcelTypeOpen ? <View style={t.scheduleOptions}>{scheduleTemplates.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: template.id === option.id }} onPress={() => { setTemplate(option); setParcelTypeOpen(false); setScheduleError(""); }} style={[t.scheduleOption, template.id === option.id && t.scheduleOptionActive]}><Txt style={t.scheduleOptionText}>{option.label}</Txt></Pressable>)}</View> : null}
        </View>
        <View style={t.scheduleRow}>
          <View style={t.scheduleColumn}>
            <Txt style={t.scheduleLabel}>Date</Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Date: ${date ? formatDisplayDate(date) : "Select date"}`}
              onPress={() => {
                setOriginOpen(false);
                setDestinationOpen(false);
                setParcelTypeOpen(false);
                setPickerOpen(curr => (curr === "date" ? null : "date"));
              }}
              style={[t.scheduleSelect, t.scheduleSelectCompact, pickerOpen === "date" && t.scheduleSelectActive]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
                <Calendar size={18} color={date ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
                <Txt
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[
                    t.scheduleSelectText,
                    t.scheduleSelectTextCompact,
                    !date && t.scheduleSelectPlaceholder,
                    Platform.OS === "web" && ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any),
                  ]}
                >
                  {date ? formatDisplayDate(date) : "Select date"}
                </Txt>
              </View>
              <ChevronDown size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={t.scheduleColumn}>
            <Txt style={t.scheduleLabel}>Time</Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Time: ${time ? formatDisplayTime(time) : "Select time"}`}
              onPress={() => {
                setOriginOpen(false);
                setDestinationOpen(false);
                setParcelTypeOpen(false);
                setPickerOpen(curr => (curr === "time" ? null : "time"));
              }}
              style={[t.scheduleSelect, t.scheduleSelectCompact, pickerOpen === "time" && t.scheduleSelectActive]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
                <Clock size={18} color={time ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
                <Txt
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[
                    t.scheduleSelectText,
                    t.scheduleSelectTextCompact,
                    !time && t.scheduleSelectPlaceholder,
                    Platform.OS === "web" && ({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as any),
                  ]}
                >
                  {time ? formatDisplayTime(time) : "Select time"}
                </Txt>
              </View>
              <ChevronDown size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        {pickerOpen === "date" ? (
          <CalendarPicker
            selectedValue={date}
            onSelect={selectedDate => {
              setDate(selectedDate);
              setPickerOpen(null);
              setScheduleError("");
            }}
          />
        ) : null}
        {pickerOpen === "time" ? (
          <TimePicker
            selectedValue={time}
            selectedDate={date}
            onSelect={selectedTime => {
              setTime(selectedTime);
              setPickerOpen(null);
              setScheduleError("");
            }}
          />
        ) : null}
        {scheduleError ? <Notice tone="error">{scheduleError}</Notice> : null}
        <Button title="Schedule this trip" variant="lime" disabled={!isScheduleReady(origin, destination, date, time)} onPress={() => void scheduleTrip()} />
        <Button title="Cancel" variant="secondary" onPress={() => { setOriginOpen(false); setDestinationOpen(false); setParcelTypeOpen(false); setPickerOpen(null); setScheduleStage("closed"); onScheduleTripFlowHandled?.(); }} />
      </View>
    </PresentationSheet> : null}
    {scheduleStage === "submitting" ? <PresentationSheet title="Scheduling trip" onClose={() => undefined}>
      <View style={t.scheduleLoading}>
        <ActivityIndicator color={colors.lime} size="large" />
        <Txt style={t.scheduleLoadingText}>Scheduling your trip from {origin || "—"} to {destination || "—"}</Txt>
      </View>
    </PresentationSheet> : null}
  </View>;
}

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
  const { snapshot, offline } = usePassenger();
  const cancel = useMutation(api.journeys.cancel);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ended = trip.status === "cancelled" || trip.status === "completed" || trip.departureAt <= Date.now();
  const committed = (trip.reservedKg ?? 0) > 0 || snapshot!.shipments.some(shipment => shipment.tripId === trip.id && !["cancelled", "rejected"].includes(shipment.status));

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

function LocationDropdown({
  label,
  value,
  placeholder,
  isOpen,
  onToggle,
  options,
  onSelect,
  baseLocation,
}: {
  label: string;
  value: string;
  placeholder: string;
  isOpen: boolean;
  onToggle: () => void;
  options: string[];
  onSelect: (city: string) => void;
  baseLocation: string;
}) {
  return (
    <View style={t.scheduleSection}>
      <Txt style={t.scheduleLabel}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
        onPress={onToggle}
        style={[t.scheduleSelect, isOpen && t.scheduleSelectActive]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <MapPin size={20} color={value ? semantic.color.brand.primary : colors.muted} strokeWidth={2} />
          <Txt style={[t.scheduleSelectText, !value && t.scheduleSelectPlaceholder]}>{value || placeholder}</Txt>
        </View>
        <ChevronDown size={20} color={colors.text} strokeWidth={2} />
      </Pressable>
      {isOpen ? (
        <View style={t.scheduleOptions}>
          {options.map(city => (
            <Pressable
              key={city}
              accessibilityRole="radio"
              accessibilityState={{ checked: city === value }}
              onPress={() => onSelect(city)}
              style={[t.scheduleOption, city === value && t.scheduleOptionActive]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Txt style={t.scheduleOptionText}>{city}</Txt>
                {city === baseLocation ? <Badge label="Base" tone="green" /> : null}
              </View>
              {city === value ? <Txt style={t.schedulePickerOptionSelected}>Selected</Txt> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "";
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  if (!Number.isFinite(dateObj.getTime())) return dateStr;
  return dateObj.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayTime(timeStr: string) {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  if (!hStr || !mStr) return timeStr;
  let h = Number(hStr);
  const m = mStr.padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${String(h).padStart(2, "0")}:${m} ${period}`;
}

function CalendarPicker({
  selectedValue,
  onSelect,
}: {
  selectedValue: string;
  onSelect: (date: string) => void;
}) {
  const initialDate = useMemo(() => {
    if (selectedValue && /^\d{4}-\d{2}-\d{2}$/.test(selectedValue)) {
      const [y, m, d] = selectedValue.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [selectedValue]);

  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const maxDate = useMemo(() => {
    const m = new Date(today);
    m.setDate(m.getDate() + 90);
    return m;
  }, [today]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthLabel = currentMonth.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const canGoPrev = useMemo(() => {
    const prevMonthEnd = new Date(year, month, 0);
    return prevMonthEnd.getTime() >= today.getTime();
  }, [year, month, today]);

  const canGoNext = useMemo(() => {
    const nextMonthStart = new Date(year, month + 1, 1);
    return nextMonthStart.getTime() <= maxDate.getTime();
  }, [year, month, maxDate]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d);
  }

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <View style={calStyles.card}>
      <View style={calStyles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={handlePrevMonth}
          disabled={!canGoPrev}
          style={({ pressed }) => [
            calStyles.navButton,
            !canGoPrev && calStyles.navButtonDisabled,
            pressed && canGoPrev && calStyles.navButtonPressed,
          ]}
        >
          <ChevronLeft size={18} color={canGoPrev ? colors.text : colors.muted} strokeWidth={2.2} />
        </Pressable>
        <Txt style={calStyles.monthTitle}>{monthLabel}</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={handleNextMonth}
          disabled={!canGoNext}
          style={({ pressed }) => [
            calStyles.navButton,
            !canGoNext && calStyles.navButtonDisabled,
            pressed && canGoNext && calStyles.navButtonPressed,
          ]}
        >
          <ChevronRight size={18} color={canGoNext ? colors.text : colors.muted} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={calStyles.weekRow}>
        {dayNames.map(name => (
          <View key={name} style={calStyles.dayHeaderCell}>
            <Txt style={calStyles.dayHeaderText}>{name}</Txt>
          </View>
        ))}
      </View>

      <View style={calStyles.grid}>
        {days.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={calStyles.dayCell} />;
          }

          const dayDate = new Date(year, month, day, 0, 0, 0, 0);
          const isPast = dayDate.getTime() < today.getTime();
          const isTooFar = dayDate.getTime() > maxDate.getTime();
          const disabled = isPast || isTooFar;

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isSelected = selectedValue === dateStr;
          const isToday = dayDate.getTime() === today.getTime();

          return (
            <Pressable
              key={`day-${day}`}
              accessibilityRole="button"
              accessibilityLabel={`${day} ${monthLabel}`}
              accessibilityState={{ selected: isSelected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(dateStr)}
              style={({ pressed }) => [
                calStyles.dayCell,
                isSelected && calStyles.dayCellSelected,
                isToday && !isSelected && calStyles.dayCellToday,
                pressed && !disabled && calStyles.dayCellPressed,
              ]}
            >
              <Txt
                style={[
                  calStyles.dayText,
                  disabled && calStyles.dayTextDisabled,
                  isSelected && calStyles.dayTextSelected,
                  isToday && !isSelected && calStyles.dayTextToday,
                ]}
              >
                {day}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TIME_PRESETS = [
  { label: "Morning", time: "08:00", display: "08:00 AM" },
  { label: "Midday", time: "11:30", display: "11:30 AM" },
  { label: "Afternoon", time: "14:00", display: "02:00 PM" },
  { label: "Evening", time: "17:30", display: "05:30 PM" },
  { label: "Night", time: "20:00", display: "08:00 PM" },
];

function TimePicker({
  selectedValue,
  selectedDate,
  onSelect,
}: {
  selectedValue: string;
  selectedDate?: string;
  onSelect: (time: string) => void;
}) {
  const initialTime = useMemo(() => {
    if (selectedValue && /^([01]\d|2[0-3]):[0-5]\d$/.test(selectedValue)) {
      const [h, m] = selectedValue.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return { hour: h12, minute: m, period: period as "AM" | "PM" };
    }
    const nextHour = (new Date().getHours() + 2) % 24;
    const p = nextHour >= 12 ? "PM" : "AM";
    const h12 = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour;
    return { hour: h12, minute: 0, period: p as "AM" | "PM" };
  }, [selectedValue]);

  const [hour, setHour] = useState(initialTime.hour);
  const [minute, setMinute] = useState(initialTime.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(initialTime.period);

  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minutes = [0, 15, 30, 45];

  const handleApply = () => {
    let h = hour;
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    const timeStr = `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    onSelect(timeStr);
  };

  return (
    <View style={timeStyles.card}>
      <Txt style={timeStyles.sectionTitle}>Quick Select</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={timeStyles.presetsScroll}>
        {TIME_PRESETS.map(preset => {
          const isSelected = selectedValue === preset.time;
          return (
            <Pressable
              key={preset.time}
              accessibilityRole="button"
              accessibilityLabel={`${preset.label}: ${preset.display}`}
              onPress={() => onSelect(preset.time)}
              style={[timeStyles.presetChip, isSelected && timeStyles.presetChipSelected]}
            >
              <Txt style={[timeStyles.presetChipLabel, isSelected && timeStyles.presetChipLabelSelected]}>
                {preset.label}
              </Txt>
              <Txt style={[timeStyles.presetChipTime, isSelected && timeStyles.presetChipTimeSelected]}>
                {preset.display}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>

      <Txt style={[timeStyles.sectionTitle, { marginTop: 10 }]}>Custom Time</Txt>

      <View style={timeStyles.periodRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="AM"
          onPress={() => setPeriod("AM")}
          style={[timeStyles.periodBtn, period === "AM" && timeStyles.periodBtnActive]}
        >
          <Txt style={[timeStyles.periodText, period === "AM" && timeStyles.periodTextActive]}>AM (Morning)</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="PM"
          onPress={() => setPeriod("PM")}
          style={[timeStyles.periodBtn, period === "PM" && timeStyles.periodBtnActive]}
        >
          <Txt style={[timeStyles.periodText, period === "PM" && timeStyles.periodTextActive]}>PM (Afternoon / Evening)</Txt>
        </Pressable>
      </View>

      <Txt style={timeStyles.subLabel}>Hour</Txt>
      <View style={timeStyles.pillsRow}>
        {hours.map(h => (
          <Pressable
            key={`h-${h}`}
            accessibilityRole="button"
            accessibilityLabel={`${h} o'clock`}
            onPress={() => setHour(h)}
            style={[timeStyles.pill, hour === h && timeStyles.pillActive]}
          >
            <Txt style={[timeStyles.pillText, hour === h && timeStyles.pillTextActive]}>
              {String(h).padStart(2, "0")}
            </Txt>
          </Pressable>
        ))}
      </View>

      <Txt style={timeStyles.subLabel}>Minute</Txt>
      <View style={timeStyles.pillsRow}>
        {minutes.map(m => (
          <Pressable
            key={`m-${m}`}
            accessibilityRole="button"
            accessibilityLabel={`${m} minutes`}
            onPress={() => setMinute(m)}
            style={[timeStyles.pill, minute === m && timeStyles.pillActive]}
          >
            <Txt style={[timeStyles.pillText, minute === m && timeStyles.pillTextActive]}>
              :{String(m).padStart(2, "0")}
            </Txt>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 12 }}>
        <Button
          title={`Set Time · ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`}
          variant="lime"
          onPress={handleApply}
        />
      </View>
    </View>
  );
}

function parseScheduleDateTime(dateText: string, timeText: string) {
  const normalizedDate = dateText.trim();
  const normalizedTime = timeText.trim();
  if (!normalizedDate) throw new Error("Choose a valid departure date.");
  if (!normalizedTime) throw new Error("Choose a valid departure time.");

  let year: number, month: number, day: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    [year, month, day] = normalizedDate.split("-").map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedDate)) {
    const parts = normalizedDate.split("/").map(Number);
    day = parts[0]!;
    month = parts[1]!;
    year = parts[2]!;
  } else {
    throw new Error("Choose a valid date.");
  }

  let hour: number, minute: number;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedTime)) {
    [hour, minute] = normalizedTime.split(":").map(Number);
  } else {
    const timeMatch = normalizedTime.toUpperCase().replace(/\s+/g, " ").match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/);
    if (!timeMatch) throw new Error("Choose a valid time.");
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    if (hour < 1 || hour > 12 || minute > 59) throw new Error("Choose a valid time.");
    if (timeMatch[3] === "PM" && hour !== 12) hour += 12;
    if (timeMatch[3] === "AM" && hour === 12) hour = 0;
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error("Choose a real calendar date and time.");
  }
  if (date.getTime() <= Date.now()) {
    throw new Error("Choose a future date and time.");
  }
  return date.getTime();
}

function isScheduleReady(origin: string, destination: string, dateText: string, timeText: string) {
  return !!origin.trim() && !!destination.trim() && !!dateText.trim() && !!timeText.trim();
}

function estimateTripDurationMs(origin: string, destination: string) {
  if ([origin.trim().toLowerCase(), destination.trim().toLowerCase()].includes("jos")) return 6 * 60 * 60 * 1000;
  return 10 * 60 * 60 * 1000;
}

function isServiceRoute(origin: string, destination: string, config: { baseLocation: string; destinations: string[] }) {
  const from = origin.trim().toLowerCase();
  const to = destination.trim().toLowerCase();
  const base = config.baseLocation.trim().toLowerCase();
  const destinations = new Set(config.destinations.map(value => value.trim().toLowerCase()));
  return (from === base && destinations.has(to)) || (to === base && destinations.has(from));
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
  title: { fontSize: primitives.typography.size.headingH1Web, lineHeight: primitives.typography.lineHeight.headingH1Web, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  search: { minHeight: components.button.height.lg, marginTop: primitives.space[6], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.surface, paddingHorizontal: primitives.space[4], flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  searchText: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.regular },
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
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
