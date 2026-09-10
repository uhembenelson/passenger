import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowLeft, ChevronDown, MapPin } from "lucide-react-native";
import { routeMatches } from "@passenger/core";
import type { CreateShipmentInput, Trip } from "@passenger/core";
import { usePassenger } from "./data";
import { Avatar, Button, Card, colors, Notice, Txt } from "./ui";

export type TravellerSearchDraft = Partial<CreateShipmentInput>;
type Stage = "search" | "results" | "details";
type Props = { onClose: () => void; onBookTrip: (trip: Trip, draft: TravellerSearchDraft) => void; initialDraft?: TravellerSearchDraft };

const parcelTypes = [
  { label: "Small Envelope", weightKg: 0.5, category: "Documents" },
  { label: "Medium Parcel", weightKg: 5, category: "Other" },
  { label: "Large Parcel", weightKg: 15, category: "Other" },
] as const;
const fallbackServiceArea = { baseLocation: "Jos", destinations: ["Abuja", "Kaduna", "Lagos"] };

export function FindTravellerFlow({ onClose, onBookTrip, initialDraft }: Props) {
  const data = usePassenger();
  const snapshot = data.snapshot!;
  const viewer = snapshot.viewer!;
  const serviceArea = snapshot.serviceArea ?? fallbackServiceArea;
  const locations = useMemo(() => [serviceArea.baseLocation, ...serviceArea.destinations], [serviceArea.baseLocation, serviceArea.destinations]);
  const [stage, setStage] = useState<Stage>("search");
  const [origin, setOrigin] = useState(initialDraft?.origin ?? serviceArea.baseLocation);
  const [destination, setDestination] = useState(initialDraft?.destination ?? serviceArea.destinations[0] ?? "");
  const [parcelType, setParcelType] = useState<(typeof parcelTypes)[number]>(() => parcelTypes.find(type => type.category === initialDraft?.category && type.weightKg === initialDraft?.weightKg) ?? parcelTypes[0]);
  const [typeOpen, setTypeOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState<"origin" | "destination" | null>(null);
  const [selected, setSelected] = useState<Trip>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!locations.includes(origin) || !locations.includes(destination) || !isServiceRoute(origin, destination, serviceArea)) {
      setOrigin(serviceArea.baseLocation);
      setDestination(serviceArea.destinations[0] ?? "");
    }
  }, [destination, locations, origin, serviceArea]);

  const results = useMemo(() => snapshot.trips
    .filter(trip => trip.travellerId !== viewer.id && trip.verified && trip.status !== "cancelled" && trip.status !== "completed" && trip.departureAt > Date.now() && (trip.maxParcelWeightKg ?? trip.capacityKg) >= parcelType.weightKg && (!trip.acceptedCategories?.length || trip.acceptedCategories.includes(parcelType.category)) && routeMatches({ origin, destination }, trip))
    .sort((a, b) => a.departureAt - b.departureAt), [snapshot.trips, viewer.id, origin, destination, parcelType.weightKg]);
  const person = selected ? snapshot.people.find(item => item.id === selected.travellerId) : undefined;
  const previousTrips = selected ? snapshot.trips
    .filter(trip => trip.travellerId === selected.travellerId && trip.id !== selected.id && (trip.status === "completed" || trip.departureAt < Date.now()))
    .sort((a, b) => b.departureAt - a.departureAt).slice(0, 3) : [];
  const draft: TravellerSearchDraft = { origin: origin.trim(), destination: destination.trim(), category: parcelType.category, weightKg: parcelType.weightKg };

  const submitSearch = () => {
    setError("");
    if (!origin.trim() || !destination.trim()) return setError("Enter both pickup and destination cities.");
    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) return setError("Choose different pickup and destination cities.");
    if (!isServiceRoute(origin, destination, serviceArea)) return setError(`Trips currently need to start or end in ${serviceArea.baseLocation}.`);
    setStage("results");
  };
  const selectLocation = (field: "origin" | "destination", value: string) => {
    const base = serviceArea.baseLocation;
    if (field === "origin") {
      setOrigin(value);
      if (value !== base) setDestination(base);
      else if (destination === base) setDestination(serviceArea.destinations[0] ?? "");
    } else {
      setDestination(value);
      if (value !== base) setOrigin(base);
      else if (origin === base) setOrigin(serviceArea.destinations[0] ?? "");
    }
    setLocationOpen(null);
    setError("");
  };
  const back = () => {
    setError("");
    if (stage === "search") onClose();
    else if (stage === "results") setStage("search");
    else setStage("results");
  };
  if (stage === "details" && selected) {
    const rating = person?.rating ?? 0;
    return <View style={f.screen}>
      <FlowHeader title="Traveler Details" onBack={back} />
      <ScrollView contentContainerStyle={f.detailsScroll}>
        <Avatar name={selected.travellerName} size={82} />
        <Txt style={f.profileName}>{selected.travellerName}</Txt><Stars rating={rating} />
        <Txt style={f.profilePrice}>{selected.maxParcelWeightKg ?? selected.capacityKg} kg max parcel</Txt>
        <InfoCard title="Traveller profile"><Txt style={f.infoText}>{person?.successfulDeliveries ?? 0} successful deliveries</Txt><Txt style={f.infoText}>Member since {person ? new Date(person.joinedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "—"}</Txt></InfoCard>
        <InfoCard title="Trip details"><Txt style={f.infoText}>Route: {selected.origin} to {selected.destination}</Txt><Txt style={f.infoText}>Departure: {dateTime(selected.departureAt)}</Txt><Txt style={f.infoText}>Arrival: {selected.arrivalAt ? dateTime(selected.arrivalAt) : "Not provided"}</Txt><Txt style={f.infoText}>Capacity: {selected.capacityKg} kg</Txt><Txt style={f.infoText}>Carries: {selected.acceptedCategories?.length ? selected.acceptedCategories.join(", ") : "All supported categories"}</Txt>{selected.handlingNotes ? <Txt style={f.infoText}>{selected.handlingNotes}</Txt> : null}</InfoCard>
        <InfoCard title="Previous Trips">{previousTrips.length ? previousTrips.map(trip => <Txt key={trip.id} style={f.infoText}>{trip.origin} to {trip.destination}</Txt>) : <Txt style={f.subdued}>No completed trips are visible yet.</Txt>}</InfoCard>
        <InfoCard title="Reviews"><Txt style={f.infoText}>{person?.reviewCount ? rating.toFixed(1) + " from " + person.reviewCount + " verified review" + (person.reviewCount === 1 ? "." : "s.") : "No verified delivery reviews yet."}</Txt></InfoCard>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </ScrollView>
      <View style={f.fixedAction}><Button title="Continue with this traveller" variant="lime" onPress={() => onBookTrip(selected, draft)} style={f.primaryButton} /></View>
    </View>;
  }

  if (stage === "results") return <View style={f.screen}>
    <FlowHeader title={"Travelers going from " + origin.trim() + " to " + destination.trim()} onBack={back} />
    <ScrollView contentContainerStyle={f.resultsScroll}>{!results.length ? <Notice>No verified travellers currently have enough space on this route. Go back and adjust your search, or check again later.</Notice> : results.map(trip => {
      const traveller = snapshot.people.find(item => item.id === trip.travellerId);
      return <Pressable key={trip.id} accessibilityRole="button" accessibilityLabel={"View " + trip.travellerName} onPress={() => { setSelected(trip); setStage("details"); }}><Card style={f.resultCard}><Avatar name={trip.travellerName} size={50} /><View style={{ flex: 1 }}><Txt style={f.resultName}>{trip.travellerName}</Txt><Stars rating={traveller?.rating ?? 0} compact /></View><Txt style={f.resultPrice}>{trip.maxParcelWeightKg ?? trip.capacityKg} kg</Txt></Card></Pressable>;
    })}</ScrollView>
  </View>;

  return <View style={f.screen}>
    <FlowHeader title="Find Travelers" onBack={back} cancel />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={f.formScroll}>
      <LocationSelect label="Pickup city" value={origin} onPress={() => setLocationOpen("origin")} />
      <LocationSelect label="Destination city" value={destination} onPress={() => setLocationOpen("destination")} />
      <Txt style={f.label}>Parcel Type</Txt><Pressable accessibilityRole="button" onPress={() => setTypeOpen(true)} style={f.select}><Txt style={f.inputText}>{parcelType.label}</Txt><ChevronDown size={22} color={colors.text} /></Pressable>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </ScrollView>
    <View style={f.fixedAction}><Button title="Find Travelers" variant="lime" onPress={submitSearch} style={f.primaryButton} /></View>
    <Modal transparent visible={locationOpen !== null} animationType="fade" onRequestClose={() => setLocationOpen(null)}><Pressable style={f.modalBackdrop} onPress={() => setLocationOpen(null)}><View style={f.typeSheet}><Txt style={f.sheetTitle}>{locationOpen === "origin" ? "Select pickup location" : "Select destination"}</Txt>{locations.map(location => <Pressable key={location} accessibilityRole="radio" accessibilityState={{ checked: location === (locationOpen === "origin" ? origin : destination) }} onPress={() => selectLocation(locationOpen!, location)} style={f.typeOption}><Txt style={f.inputText}>{location}</Txt>{location === serviceArea.baseLocation ? <Txt style={f.subdued}>Base location</Txt> : null}</Pressable>)}</View></Pressable></Modal>
    <Modal transparent visible={typeOpen} animationType="fade" onRequestClose={() => setTypeOpen(false)}><Pressable style={f.modalBackdrop} onPress={() => setTypeOpen(false)}><View style={f.typeSheet}>{parcelTypes.map(type => <Pressable key={type.label} accessibilityRole="radio" accessibilityState={{ checked: type.label === parcelType.label }} onPress={() => { setParcelType(type); setTypeOpen(false); }} style={f.typeOption}><Txt style={f.inputText}>{type.label}</Txt><Txt style={f.subdued}>Up to {type.weightKg} kg</Txt></Pressable>)}</View></Pressable></Modal>
  </View>;
}

function FlowHeader({ title, onBack, cancel }: { title: string; onBack: () => void; cancel?: boolean }) { return <View style={f.header}><Pressable accessibilityRole="button" accessibilityLabel={cancel ? "Cancel" : "Back"} hitSlop={10} pressRetentionOffset={20} onPress={onBack} style={f.back}>{cancel ? <Txt style={f.cancel}>Cancel</Txt> : <ArrowLeft size={24} color={colors.text} />}</Pressable><Txt pointerEvents="none" numberOfLines={2} style={f.title}>{title}</Txt><View pointerEvents="none" style={f.headerBalance} /></View>; }
function LocationSelect({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={label + ": " + value} onPress={onPress} style={f.locationInput}><MapPin size={21} color={colors.text} /><Txt style={f.locationValue}>{value}</Txt><ChevronDown size={21} color={colors.text} /></Pressable>; }
function Stars({ rating, compact }: { rating: number; compact?: boolean }) { const rounded = Math.round(rating); return <View accessibilityLabel={rating.toFixed(1) + " out of 5 stars"} style={f.stars}>{[1, 2, 3, 4, 5].map(value => <Txt key={value} style={[compact ? f.starCompact : f.star, { color: value <= rounded ? "#FFC400" : "#CDD3D0" }]}>★</Txt>)}</View>; }
function InfoCard({ title, children }: React.PropsWithChildren<{ title: string }>) { return <Card style={f.infoCard}><Txt style={f.infoTitle}>{title}</Txt><View style={{ gap: 7 }}>{children}</View></Card>; }
function dateTime(timestamp: number) { return new Date(timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function timeOnly(timestamp: number) { return new Date(timestamp).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }).toLowerCase(); }
function isServiceRoute(origin: string, destination: string, config: { baseLocation: string; destinations: string[] }) { const from = origin.trim().toLowerCase(); const to = destination.trim().toLowerCase(); const base = config.baseLocation.trim().toLowerCase(); const destinations = new Set(config.destinations.map(value => value.trim().toLowerCase())); return (from === base && destinations.has(to)) || (to === base && destinations.has(from)); }

const f = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, header: { minHeight: 76, paddingHorizontal: 17, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 70, minHeight: 48, justifyContent: "center", zIndex: 1 }, cancel: { fontSize: 14, lineHeight: 20, fontFamily: "WorkSansSemiBold" }, title: { flex: 1, textAlign: "center", fontSize: 17, lineHeight: 23, fontFamily: "WorkSansSemiBold" }, headerBalance: { width: 70 },
  formScroll: { paddingHorizontal: 17, paddingTop: 18, paddingBottom: 120, gap: 14 }, locationInput: { minHeight: 56, borderRadius: 13, backgroundColor: colors.paper, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 13 },
  locationValue: { flex: 1, fontSize: 17, lineHeight: 23, color: colors.text }, label: { marginTop: 5, fontSize: 16, lineHeight: 22, color: colors.text },
  select: { minHeight: 56, borderRadius: 13, backgroundColor: colors.paper, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, inputText: { fontSize: 16, lineHeight: 22, color: colors.text },
  fixedAction: { paddingHorizontal: 17, paddingTop: 10, paddingBottom: 24, backgroundColor: colors.bg }, primaryButton: { minHeight: 52 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.52)", justifyContent: "flex-end", padding: 17 }, typeSheet: { borderRadius: 18, backgroundColor: colors.bg, padding: 8 }, sheetTitle: { paddingHorizontal: 14, paddingVertical: 13, fontSize: 17, lineHeight: 23, fontFamily: "WorkSansSemiBold" }, typeOption: { minHeight: 60, paddingHorizontal: 14, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border }, subdued: { fontSize: 12, lineHeight: 18, color: colors.muted },
  resultsScroll: { paddingHorizontal: 17, paddingTop: 14, paddingBottom: 30, gap: 18 }, resultCard: { minHeight: 94, borderWidth: 0, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 13 }, resultName: { fontSize: 17, lineHeight: 22, color: colors.text, fontFamily: "WorkSansMedium" },
  stars: { flexDirection: "row", alignItems: "center", marginTop: 5 }, star: { fontSize: 24, lineHeight: 29 }, starCompact: { fontSize: 17, lineHeight: 21 }, resultDate: { marginTop: 3, fontSize: 10, lineHeight: 14, color: colors.muted }, resultPrice: { fontSize: 16, lineHeight: 22, color: colors.lime, fontFamily: "WorkSansMedium" },
  detailsScroll: { alignItems: "center", paddingHorizontal: 17, paddingTop: 15, paddingBottom: 115, gap: 12 }, profileName: { marginTop: 4, fontSize: 20, lineHeight: 26, fontFamily: "WorkSansMedium" }, profilePrice: { fontSize: 20, lineHeight: 26, color: colors.lime, fontFamily: "WorkSansMedium" },
  successPill: { minHeight: 42, borderRadius: 21, backgroundColor: colors.lime, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "center", marginBottom: 10 }, successPillText: { fontSize: 16, lineHeight: 22, color: "white", fontFamily: "WorkSansMedium" },
  infoCard: { width: "100%", borderWidth: 0, borderRadius: 14, padding: 17, marginTop: 8 }, infoTitle: { marginBottom: 14, fontSize: 15, lineHeight: 21, color: colors.muted, fontFamily: "WorkSansMedium" }, infoText: { fontSize: 14, lineHeight: 20, color: colors.text },
  paymentScroll: { paddingHorizontal: 17, paddingTop: 18, paddingBottom: 120, gap: 18 }, paymentInfoCard: { borderWidth: 0, borderRadius: 14, padding: 17, backgroundColor: "#D9EFE2" }, paymentInfoIcon: { alignSelf: "center", marginBottom: 14 }, paymentBullet: { fontSize: 14, lineHeight: 22, color: colors.text, marginBottom: 12 }, paymentAmount: { textAlign: "center", fontSize: 24, lineHeight: 32, color: colors.text, fontFamily: "WorkSansSemiBold", marginTop: 8 }, walletCard: { borderWidth: 0, borderRadius: 14, padding: 17, minHeight: 72, justifyContent: "center" }, walletText: { fontSize: 16, lineHeight: 22, color: colors.text },
  chatBody: { flexGrow: 1, paddingHorizontal: 17, paddingTop: 10, paddingBottom: 24 }, chatBubble: { alignSelf: "flex-end", maxWidth: "78%", backgroundColor: colors.paper, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 }, chatBubbleText: { fontSize: 15, lineHeight: 21, color: colors.text }, chatComposer: { paddingHorizontal: 17, paddingBottom: 24, backgroundColor: colors.bg }, chatInputShell: { minHeight: 56, borderRadius: 28, backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.lime, paddingLeft: 16, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 8 }, chatInput: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.text }, chatSend: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  loadingOverlay: { flex: 1, backgroundColor: "rgba(17,24,39,0.52)", alignItems: "center", justifyContent: "center" }, loadingCard: { width: 92, height: 92, borderRadius: 18, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
});
