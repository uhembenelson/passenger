import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Home as HomeIcon, Plus, Route, Truck, User } from "lucide-react-native";
import { findMatchingTrips, money, shipmentActions } from "@passenger/core";
import type { CreateShipmentInput, Shipment, Trip } from "@passenger/core";
import { usePassenger } from "./data";
import { DeliveryDetail } from "./delivery";
import { MobileHome } from "./mobile-home";
import { MobileTripsScreen } from "./mobile-trips";
import { PhoneVerificationHome } from "./phone-verification";
import { Profile } from "./profile";
import { SenderDeliveriesScreen } from "./sender-deliveries";
import { DraggableFAB } from "./draggable-fab";
import { Inbox } from "./social";
import { MyTrips } from "./trips";
import { ShipmentForm, TripForm } from "./forms";
import { getPendingEvidenceResumeKey } from "./evidence";
import { Avatar, Badge, Button, Card, colors, Empty, errorMessage, Field, Notice, PresentationSheet, RouteLine, s, SectionTitle, serif, Sheet, shortDate, Status, timeDate, Txt } from "./ui";

type Page = "home" | "routes" | "matches" | "activity" | "profile";
type Mode = "sender" | "traveller";
const nav: { id: Page; title: string; icon: string }[] = [{ id: "home", title: "Home", icon: "⌂" }, { id: "routes", title: "Find routes", icon: "↗" }, { id: "matches", title: "Matches", icon: "⇄" }, { id: "activity", title: "Milestones", icon: "▤" }, { id: "profile", title: "My profile", icon: "○" }];
const HORIZONTAL_PADDING = 18;

export function PassengerShell() {
  const data = usePassenger(); const { width } = useWindowDimensions(); const desktop = width >= 1000; const roomy = width >= 1250;
  const [page, setPage] = useState<Page>("home"); const [mode, setMode] = useState<Mode>("sender"); const [form, setForm] = useState<"shipment" | "trip" | null>(null); const [prefill, setPrefill] = useState<Trip | undefined>(); const [prefillDraft, setPrefillDraft] = useState<Partial<CreateShipmentInput> | undefined>(); const [editingShipment, setEditingShipment] = useState<Shipment | undefined>(); const [selected, setSelected] = useState<string | null>(null); const [safety, setSafety] = useState(false); const [toast, setToast] = useState(""); const [phoneVerificationCelebration, setPhoneVerificationCelebration] = useState(false);
  const [openMyTrips, setOpenMyTrips] = useState(false);
  const [openScheduleTripFlow, setOpenScheduleTripFlow] = useState(false);
  useEffect(() => {
    void (async () => {
      if (form === "shipment") return;
      const pendingResume = await getPendingEvidenceResumeKey();
      if (pendingResume !== "shipment-form") return;
      setMode("sender");
      setForm("shipment");
    })();
  }, [form]);
  const snapshot = data.snapshot;
  if (data.authError) return <Centered title="Let's reconnect your account." detail={data.authError}><Button title="Sign out and try again" onPress={() => void data.signOut().catch(() => undefined)} /></Centered>;
  if (!snapshot || data.authLoading) return <Centered title="Making room for your journey." detail="Securely loading your Passenger account…"><ActivityIndicator color={colors.forest} /></Centered>;
  if (!snapshot.viewer) return <ProfileBootstrap />;
  const viewer = snapshot.viewer;
  const openForm = (kind: "shipment" | "trip", trip?: Trip, draft?: Partial<CreateShipmentInput>) => { setEditingShipment(undefined); setPrefill(trip); setPrefillDraft(draft); setForm(kind); };
  const openShipmentEdit = (shipment: Shipment) => { setSelected(null); setPrefill(undefined); setPrefillDraft(undefined); setEditingShipment(shipment); setForm("shipment"); };
  const openTripCreation = () => {
    if (desktop) {
      setMode("traveller");
      openForm("trip");
      return;
    }
    setPage("routes");
    setOpenMyTrips(true);
    setOpenScheduleTripFlow(true);
  };
  const closeForm = () => { setForm(null); setEditingShipment(undefined); setPrefill(undefined); setPrefillDraft(undefined); };
  const phoneVerified = !!viewer.phoneVerificationTime;
  const mobileNavigation = <MobileNavigation page={page} showFab={page !== "routes"} onSelect={nextPage => { setOpenScheduleTripFlow(false); setPage(nextPage); }} onCreateTrip={openTripCreation} onCreateShipment={() => { setMode("sender"); openForm("shipment"); }} />;
  const selectedShipment = snapshot.shipments.find(item => item.id === selected);
  if (!desktop) {
    const mobileContent = page === "home"
      ? (!phoneVerified || phoneVerificationCelebration
          ? <PhoneVerificationHome viewer={viewer} celebrating={phoneVerificationCelebration} navigation={mobileNavigation} onCelebrationChange={setPhoneVerificationCelebration} onFindTravellers={() => setPage("routes")} onScheduleTrip={openTripCreation} onOpenMilestones={() => setPage("activity")} onSafety={() => setSafety(true)} />
          : <MobileHome viewer={viewer} navigation={mobileNavigation} onBookTrip={(trip, draft) => { setPage("routes"); openForm("shipment", trip, draft); }} onOpenMilestones={() => setPage("activity")} onSafety={() => setSafety(true)} />)
      : page === "activity"
        ? <SenderDeliveriesScreen navigation={mobileNavigation} notice={toast} onNoticeDismiss={() => setToast("")} />
        : page === "routes"
          ? <MobileTripsScreen initialTab={openMyTrips ? "mine" : "available"} notice={toast} navigation={mobileNavigation} onBookTrip={(trip, draft) => openForm("shipment", trip, draft)} requestOpenScheduleTrip={openScheduleTripFlow} onScheduleTripFlowHandled={() => setOpenScheduleTripFlow(false)} />
          : <Profile viewer={viewer} navigation={mobileNavigation} onToast={setToast} onSafety={() => setSafety(true)} onOpenDelivery={setSelected} />;

    return <SafeAreaView style={x.safe} edges={["top", "bottom"]}>
      {mobileContent}
      {selectedShipment && <DeliveryDetail key={`${viewer.id}:${selectedShipment.id}:${selectedShipment.status}`} shipment={selectedShipment} onClose={() => setSelected(null)} onEdit={shipmentActions(selectedShipment, viewer).edit ? () => openShipmentEdit(selectedShipment) : undefined} />}
      {safety && <Safety onClose={() => setSafety(false)} />}
      {form === "shipment" && <ShipmentForm shipment={editingShipment} trip={prefill} draft={prefillDraft} onClose={closeForm} onSuccess={() => { const wasEditingShipment = !!editingShipment; closeForm(); setPage("activity"); setMode("sender"); setToast(wasEditingShipment ? "Your parcel was updated and resubmitted for review." : "Your parcel is submitted for review. We'll keep its next steps here."); }} />}
      {form === "trip" && <TripForm onClose={() => setForm(null)} onSuccess={() => { setOpenMyTrips(true); setForm(null); setPage("routes"); setMode("traveller"); setToast("Your trip is published and live in My trips."); }} />}
    </SafeAreaView>;
  }
  const mine = snapshot.shipments.filter(item => mode === "sender" ? item.senderId === viewer.id : item.travellerId === viewer.id);
  const active = mine.filter(item => !["delivered", "cancelled"].includes(item.status));
  const myTrips = snapshot.trips.filter(t => t.travellerId === viewer.id && t.departureAt > Date.now());
  const available = snapshot.shipments.filter(item => item.status === "open" && item.senderId !== viewer.id);
  const matchCount = mode === "sender" ? mine.filter(item => item.status === "open" && findMatchingTrips(item, snapshot.trips).some(t => t.travellerId !== viewer.id)).length : available.filter(item => findMatchingTrips(item, myTrips).length > 0).length;
  const contentProps = { mode, openForm, onDetail: setSelected };
  return <SafeAreaView style={x.safe} edges={["top", "bottom"]}>
    {data.offline && <Notice tone="warning">You're offline. These are the last received records; reconnect before making changes.</Notice>}
    <View style={{ flex: 1, flexDirection: "row" }}>
      {desktop && <View style={x.sidebar}><Logo /><View style={{ marginTop: 43, gap: 8 }}>{nav.map(item => <NavItem key={item.id} item={item} active={page === item.id} count={item.id === "matches" ? matchCount : undefined} onPress={() => setPage(item.id)} />)}</View><View style={{ flex: 1 }} /><View style={x.sideTip}><View style={x.tipCircle}><Txt style={{ color: colors.forest, fontSize: 22 }}>✳</Txt></View><Txt style={{ fontWeight: "600", fontSize: 13, marginTop: 12 }}>A little space. A big help.</Txt><Txt style={[s.muted, { fontSize: 11, marginTop: 7, lineHeight: 18 }]}>Your next trip could make someone's day.</Txt><Button title="Share your route  ↗" variant="ghost" small onPress={() => { setMode("traveller"); openForm("trip"); }} style={{ paddingHorizontal: 0, alignItems: "flex-start", marginTop: 6 }} /></View><Pressable accessibilityRole="button" onPress={() => setSafety(true)} style={[s.row, { marginTop: 27, padding: 8 }]}><Txt style={{ fontSize: 17 }}>♧</Txt><Txt style={{ fontSize: 12, color: colors.muted }}>Trust & safety</Txt></Pressable><View style={x.sidebarProfile}><Avatar name={viewer.name} size={35} /><View style={{ flex: 1 }}><Txt numberOfLines={1} style={{ fontSize: 12, fontWeight: "600" }}>{viewer.name}</Txt><Txt style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>Passenger member</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Open my profile" onPress={() => setPage("profile")}><Txt>↗</Txt></Pressable></View></View>}
      <View style={{ flex: 1, minWidth: 0 }}><View style={x.topbar}>{desktop ? <Txt style={{ fontSize: 13, fontWeight: "600" }}>{nav.find(n => n.id === page)?.title}</Txt> : <Logo compact />}<View style={s.row}><Pressable accessibilityRole="button" onPress={() => setSafety(true)} style={{ padding: 8 }}><Txt style={{ fontSize: 11, color: colors.muted }}>{desktop ? "How Passenger works" : "How it works"}</Txt></Pressable><View style={x.topbarDivider} /><Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => setPage("profile")}><Avatar name={viewer.name} size={34} /></Pressable></View></View>
        <ScrollView contentContainerStyle={[x.scroll, !desktop && { paddingTop: 25 }]} keyboardShouldPersistTaps="handled"><View style={x.content}>
          <View style={[x.welcomeRow, width < 620 && { alignItems: "flex-start", flexDirection: "column", gap: 17 }]}><View>{page !== "activity" && <Txt style={s.eyebrow}>{page === "home" ? "A BETTER WAY TO GO THE DISTANCE" : "YOUR PASSENGER SPACE"}</Txt>}<Txt style={x.welcome}>{page === "home" ? `Hello, ${viewer.name.split(" ")[0]}.` : page === "routes" ? "Going your way." : page === "matches" ? "Better, together." : page === "activity" ? "Milestones." : "You're part of the journey."}<Txt style={{ color: "#96A16E" }}>{page === "home" ? " ☀" : ""}</Txt></Txt></View><View style={x.modeSwitch}>{(["sender", "traveller"] as Mode[]).map(value => <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === value }} key={value} onPress={() => { setMode(value); setToast(""); }} style={[x.modeButton, mode === value && x.modeActive]}><Txt style={{ color: mode === value ? "white" : colors.muted, fontSize: 11, fontWeight: "600" }}>{value === "sender" ? "↗  I'm sending" : "⇄  I'm travelling"}</Txt></Pressable>)}</View></View>
          {toast !== "" && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setToast("")} style={{ marginBottom: 20 }}><Notice tone="success">{toast}  ×</Notice></Pressable>}
          {viewer.verification !== "verified" && page !== "profile" && <View style={{ marginBottom: 20 }}><Notice tone="warning">{viewer.verification === "pending" ? "Identity review in progress." : "Your identity review needs attention."} Verification is required before publishing parcels or trips, and both people must be verified before matching. See My profile for details.</Notice></View>}
          {page === "home" && <>
            <Hero mode={mode} compact={!roomy} onCreate={() => openForm(mode === "sender" ? "shipment" : "trip")} onLearn={() => setSafety(true)} />
            <View style={[x.stats, { marginTop: 24 }]}><Stat icon="↗" value={String(active.length).padStart(2, "0")} title={mode === "sender" ? "Active deliveries" : "Parcels to carry"} foot="A little closer, every step" /><Stat icon="⇄" value={String(mode === "sender" ? matchCount : myTrips.length).padStart(2, "0")} title={mode === "sender" ? "Parcels with route matches" : "Upcoming trips"} foot={mode === "sender" ? "Find their next companion" : "Your spare space, put to use"} /><Stat icon="✓" value={String(mine.filter(item => item.status === "delivered").length).padStart(2, "0")} title="Safely delivered" foot="Good things in good hands" /></View>
            <View style={{ marginTop: 34 }}><RouteBrowser mode={mode} onCreate={openForm} compact onAll={() => setPage("routes")} /></View>
            <View style={[roomy ? { flexDirection: "row", alignItems: "flex-start", gap: 24 } : { gap: 24 }, { marginTop: 34 }]}><View style={{ flex: 1 }}><SectionTitle title={mode === "sender" ? "Your parcels, at a glance" : "On your journey"} action="View all" onAction={() => setPage("activity")} />{mine.length === 0 ? <Empty title="Your first chapter starts here." detail={mode === "sender" ? "Send a parcel and follow each confirmed milestone here." : "Accepted parcels and their milestones will appear here."} action={mode === "sender" ? "Send a package" : "Browse matches"} onAction={() => mode === "sender" ? openForm("shipment") : setPage("matches")} /> : <View style={{ gap: 12 }}>{mine.slice(0, 3).map(item => <ShipmentRow key={item.id} shipment={item} onPress={() => setSelected(item.id)} />)}</View>}</View><View style={roomy ? { width: 265 } : undefined}><TrustCard onPress={() => setSafety(true)} /></View></View>
          </>}
          {page === "routes" && <RouteBrowser mode={mode} onCreate={openForm} />}
          {page === "matches" && <Matches {...contentProps} />}
          {page === "activity" && <Activity {...contentProps} />}
          {page === "profile" && <View style={{ gap: 24 }}><Profile key={viewer.id} onToast={setToast} onSafety={() => setSafety(true)} onOpenDelivery={setSelected} /><Inbox onDetail={setSelected} /></View>}
          <View style={x.footer}><Logo compact muted /><Txt style={{ fontSize: 10, color: "#90988B" }}>Good things, going places.</Txt><Pressable accessibilityRole="button" onPress={() => setSafety(true)}><Txt style={{ fontSize: 10, color: colors.muted }}>Made for trust ↗</Txt></Pressable></View>
        </View></ScrollView>
        {!desktop && mobileNavigation}
      </View>
    </View>
    {form === "shipment" && <ShipmentForm shipment={editingShipment} trip={prefill} draft={prefillDraft} onClose={() => { setForm(null); setEditingShipment(undefined); setPrefill(undefined); setPrefillDraft(undefined); }} onSuccess={() => { const wasEditingShipment = !!editingShipment; setForm(null); setEditingShipment(undefined); setPrefill(undefined); setPrefillDraft(undefined); setPage("activity"); setMode("sender"); setToast(wasEditingShipment ? "Your parcel was updated and resubmitted for review." : "Your parcel is submitted for review. We'll keep its next steps here."); }} />}
    {form === "trip" && <TripForm onClose={() => setForm(null)} onSuccess={() => { setOpenMyTrips(true); setForm(null); setPage("routes"); setMode("traveller"); setToast("Your trip is published and live in My trips."); }} />}
    {selectedShipment && <DeliveryDetail key={`${viewer.id}:${selectedShipment.id}:${selectedShipment.status}`} shipment={selectedShipment} onClose={() => setSelected(null)} onEdit={shipmentActions(selectedShipment, viewer).edit ? () => openShipmentEdit(selectedShipment) : undefined} />}
    {safety && <Safety onClose={() => setSafety(false)} />}
  </SafeAreaView>;
}

function Logo({ compact, muted }: { compact?: boolean; muted?: boolean }) { return <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 6 : 9, opacity: muted ? 0.55 : 1 }}><View style={{ height: compact ? 26 : 33, width: compact ? 26 : 33, borderRadius: 9, backgroundColor: colors.forest, justifyContent: "center", alignItems: "center" }}><Txt style={{ color: colors.lime, fontSize: compact ? 19 : 25, lineHeight: compact ? 23 : 29 }}>↗</Txt></View><Txt style={{ fontSize: compact ? 18 : 24, fontWeight: "700", letterSpacing: -1 }}>passenger<Txt style={{ color: "#94AB5C" }}>.</Txt></Txt></View>; }
function NavItem({ item, active, onPress, count }: { item: typeof nav[number]; active: boolean; onPress: () => void; count?: number }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[x.navItem, active && { backgroundColor: colors.forest }]}><Txt style={{ fontSize: 20, width: 23, textAlign: "center", color: active ? colors.lime : colors.muted }}>{item.icon}</Txt><Txt style={{ color: active ? "white" : "#6B786D", fontSize: 12, flex: 1, fontWeight: active ? "600" : "400" }}>{item.title}</Txt>{count !== undefined && count > 0 && <View style={{ backgroundColor: active ? colors.lime : colors.soft, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }}><Txt style={{ fontSize: 9 }}>{count}</Txt></View>}</Pressable>; }
const mobileNav: { id: Page; title: string; icon: typeof HomeIcon }[] = [
  { id: "home", title: "Home", icon: HomeIcon },
  { id: "activity", title: "Milestones", icon: Truck },
  { id: "routes", title: "Trips", icon: Route },
  { id: "profile", title: "Profile", icon: User },
];
function MobileNavigation({ page, onSelect, onCreateTrip, onCreateShipment, showFab = true }: { page: Page; onSelect: (page: Page) => void; onCreateTrip: () => void; onCreateShipment: () => void; showFab?: boolean }) {
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  return <>
    {showFab ? <DraggableFAB onPress={() => setCreateSheetOpen(true)} /> : null}

    <View style={x.bottomNav}>{mobileNav.map(item => {
      const active = page === item.id;
      const Icon = item.icon;
      return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: active }} onPress={() => { setCreateSheetOpen(false); onSelect(item.id); }} style={x.bottomNavItem}>
        <Icon size={22} color={active ? colors.lime : "#B4AFBC"} strokeWidth={2.1} />
        <Txt style={[x.bottomNavLabel, active && x.bottomNavLabelActive]}>{item.title}</Txt>
      </Pressable>;
    })}</View>

    {showFab && createSheetOpen ? <PresentationSheet title="Create" onClose={() => setCreateSheetOpen(false)}>
      <View style={{ gap: 12 }}>
        <Txt style={s.muted}>Choose what you want to do.</Txt>
        <Button title="Send a package" variant="lime" onPress={() => { setCreateSheetOpen(false); onCreateShipment(); }} />
        <Button title="Publish a trip" variant="secondary" onPress={() => { setCreateSheetOpen(false); onCreateTrip(); }} />
      </View>
    </PresentationSheet> : null}
  </>;
}
function Hero({ mode, compact, onCreate, onLearn }: { mode: Mode; compact: boolean; onCreate: () => void; onLearn: () => void }) {
  const { width } = useWindowDimensions(); const showArt = width > 650;
  return <View style={x.hero}><View style={{ flex: 1, padding: compact ? 27 : 37, zIndex: 1 }}><View style={x.heroTag}><View style={{ height: 5, width: 5, borderRadius: 3, backgroundColor: colors.lime }} /><Txt style={{ color: "#D9E6CE", fontSize: 9, letterSpacing: 1.6 }}>PEOPLE-POWERED DELIVERY</Txt></View><Txt style={[x.heroHeadline, { fontSize: width < 430 ? 35 : compact ? 40 : 48, lineHeight: width < 430 ? 43 : compact ? 48 : 55 }]}>{mode === "sender" ? "Your parcel.\nSomeone’s journey." : "You're going places.\nTake a little good."}</Txt><Txt style={x.heroCopy}>{mode === "sender" ? "Connect with verified travellers already heading your way. A thoughtful way to send, city to city." : "Turn the space in your bag into someone's delivery. Share your route and earn along the way."}</Txt><View style={[s.row, { marginTop: 24, flexWrap: "wrap" }]}><Button variant="lime" title={mode === "sender" ? "Send a package  ↗" : "Publish a trip  ↗"} onPress={onCreate} /><Pressable accessibilityRole="button" onPress={onLearn} style={{ paddingVertical: 12 }}><Txt style={{ color: "#CDD9C7", fontSize: 11 }}>Here's how it works  →</Txt></Pressable></View></View>{showArt && <ParcelArt compact={compact} />}</View>;
}
function ParcelArt({ compact }: { compact: boolean }) { return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: compact ? 205 : 260, alignItems: "center", justifyContent: "center", overflow: "hidden" }}><View style={x.artOrbit} /><View style={[x.artOrbit, { height: 135, width: 220, transform: [{ rotate: "-35deg" }], borderColor: "#426148" }]} /><View style={x.artCity}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.lime }} /><Txt style={{ fontSize: 10, color: "#CBDAC0" }}>Jos</Txt></View><View style={[x.artCity, { bottom: 43, top: undefined, left: 12 }]}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.lime }} /><Txt style={{ fontSize: 10, color: "#CBDAC0" }}>Abuja</Txt></View><View style={x.parcelShadow} /><View style={x.parcel}><View style={x.parcelTape} /><View style={x.parcelLabel}><Txt style={{ fontSize: 8, fontWeight: "700", letterSpacing: 1.2 }}>WITH CARE.</Txt><Txt style={{ fontSize: 28 }}>↗</Txt><View style={{ flexDirection: "row", gap: 2, height: 13 }}>{Array.from({ length: 12 }, (_, i) => <View key={i} style={{ width: i % 3 === 0 ? 3 : 1, height: 13, backgroundColor: colors.forest }} />)}</View></View></View><View style={x.artStamp}><Txt style={{ fontSize: 19 }}>✓</Txt></View><Txt style={{ position: "absolute", top: 37, right: 22, color: colors.lime, fontSize: 24 }}>✳</Txt></View>; }
function Stat({ icon, value, title, foot }: { icon: string; value: string; title: string; foot: string }) { const { width } = useWindowDimensions(); return <Card style={{ flex: 1, minWidth: 0, padding: width < 550 ? 13 : 21 }}><View style={[s.row, { justifyContent: "space-between", gap: 4 }]}><Txt style={{ fontSize: width < 550 ? 27 : 31, fontWeight: "500", letterSpacing: -1 }}>{value}</Txt><View style={{ width: width < 550 ? 26 : 34, height: width < 550 ? 26 : 34, borderRadius: 11, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" }}><Txt style={{ fontSize: 18 }}>{icon}</Txt></View></View><Txt style={{ fontSize: width < 550 ? 10 : 12, fontWeight: "600", marginTop: 13, lineHeight: 16 }}>{title}</Txt>{width >= 550 && <Txt style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>{foot}</Txt>}</Card>; }

function RouteBrowser({ mode, onCreate, compact, onAll }: { mode: Mode; onCreate: (kind: "shipment" | "trip", trip?: Trip) => void; compact?: boolean; onAll?: () => void }) {
  const data = usePassenger(); const snapshot = data.snapshot!; const { width } = useWindowDimensions();
  const [origin, setOrigin] = useState(""); const [destination, setDestination] = useState(""); const [query, setQuery] = useState<{ origin: string; destination: string } | null>(null); const [error, setError] = useState("");
  const trips = snapshot.trips.filter(t => t.departureAt > Date.now() && tripAvailableCapacity(t) > 0 && t.verified && (!query || (!query.origin || t.origin.toLowerCase().includes(query.origin.toLowerCase())) && (!query.destination || t.destination.toLowerCase().includes(query.destination.toLowerCase())))).sort((a, b) => a.departureAt - b.departureAt);
  const submit = () => { if (origin.trim() && destination.trim() && origin.trim().toLowerCase() === destination.trim().toLowerCase()) { setError("Choose different origin and destination cities."); return; } setError(""); setQuery({ origin: origin.trim(), destination: destination.trim() }); };
  const visible = compact && !query ? trips.slice(0, 3) : trips;
  return <><SectionTitle title={compact ? "Find a journey for your parcel" : "A route for every little thing."} subtitle={compact ? "Real people. Familiar routes. A little room for your package." : "Browse upcoming trips from verified travellers. Times are shown in your local timezone."} action={compact ? "All routes" : undefined} onAction={onAll} />
    <View style={[x.searchBox, width < 650 && { flexWrap: "wrap" }]}><View style={{ flex: 1, minWidth: 100 }}><Txt style={x.searchLabel}>FROM</Txt><SearchInput label="Search departure city" value={origin} onChange={setOrigin} placeholder="Any city" /></View><Pressable accessibilityRole="button" accessibilityLabel="Swap origin and destination" onPress={() => { setOrigin(destination); setDestination(origin); }} style={x.swap}><Txt style={{ color: "#788A71", fontSize: 18 }}>⇄</Txt></Pressable><View style={{ flex: 1, minWidth: 100 }}><Txt style={x.searchLabel}>TO</Txt><SearchInput label="Search destination city" value={destination} onChange={setDestination} placeholder="Any city" /></View><Button title="Find routes  →" onPress={submit} style={width < 650 ? { width: "100%" } : { minWidth: 130 }} /></View>
    {error !== "" && <View style={{ marginTop: 12 }}><Notice tone="error">{error}</Notice></View>}
    <View style={[s.row, { marginTop: 14, marginBottom: 17, flexWrap: "wrap", gap: 8 }]}><Txt style={{ fontSize: 10, color: colors.muted }}>POPULAR</Txt>{[{ origin: "Jos", destination: "Abuja" }, { origin: "Lagos", destination: "Ibadan" }, { origin: "Abuja", destination: "Kaduna" }].map(route => <Pressable key={route.origin} accessibilityRole="button" onPress={() => { setOrigin(route.origin); setDestination(route.destination); setQuery(route); setError(""); }} style={x.routeChip}><Txt style={{ fontSize: 10, color: colors.muted }}>{route.origin} → {route.destination}</Txt></Pressable>)}{query && <Button variant="ghost" small title="Clear filters ×" onPress={() => { setQuery(null); setOrigin(""); setDestination(""); setError(""); }} />}</View>
    {query && <Txt accessibilityLiveRegion="polite" style={[s.muted, { marginBottom: 13 }]}>{trips.length} {trips.length === 1 ? "journey" : "journeys"} found</Txt>}
    {visible.length === 0 ? <Empty title="No journeys on this route. Yet." detail="Try another city pair, check back later, or publish a trip and be the first to make room." action="Publish a trip" onAction={() => onCreate("trip")} /> : <View style={[s.wrap, { gap: 15 }]}>{visible.map(trip => <TripCard key={trip.id} trip={trip} compact={compact} onPress={() => onCreate(mode === "traveller" ? "trip" : "shipment", mode === "sender" ? trip : undefined)} mode={mode} />)}</View>}
  </>;
}
import { TextInput } from "react-native";
function SearchInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9AA291" style={{ fontSize: 14, fontWeight: "500", color: colors.text, paddingVertical: 5, minHeight: 32 }} />; }
function tripAvailableCapacity(trip: Trip) { const reserved = trip.legReservedKg?.length ? Math.max(...trip.legReservedKg) : trip.reservedKg ?? 0; return Math.max(0, trip.capacityKg - reserved); }
function TripCard({ trip, onPress, mode }: { trip: Trip; onPress: () => void; mode: Mode; compact?: boolean }) { const data = usePassenger(); const { width } = useWindowDimensions(); const own = trip.travellerId === data.snapshot?.viewer?.id; return <Card style={{ flexGrow: 1, flexBasis: width < 600 ? "100%" : 220, padding: 20 }}><View style={[s.row, { justifyContent: "space-between", marginBottom: 22 }]}><View style={[s.row, { gap: 9 }]}><Avatar name={trip.travellerName} size={32} color={trip.origin === "Jos" ? "#EADFD0" : trip.origin === "Abuja" ? "#E6E5D2" : "#DCE9DD"} /><View><Txt style={{ fontSize: 11, fontWeight: "600" }}>{own ? "Your trip" : trip.travellerName}</Txt><Txt style={{ fontSize: 9, color: colors.muted, marginTop: 3 }}>✓ Identity verified</Txt></View></View><Txt style={{ color: colors.muted, fontSize: 9 }}>{shortDate(trip.departureAt)}</Txt></View><RouteLine origin={trip.origin} destination={trip.destination} compact /><View style={[s.row, { gap: 7, marginTop: 14 }]}><Txt style={{ fontSize: 10, color: colors.muted }}>◷ {new Date(trip.departureAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Txt><Txt style={{ color: colors.border }}>·</Txt><Txt style={{ fontSize: 10, color: colors.muted }}>{tripAvailableCapacity(trip)} kg available</Txt></View><View style={{ height: 1, backgroundColor: colors.border, marginVertical: 17 }} /><View style={[s.row, { justifyContent: "space-between" }]}><View><Txt style={{ fontSize: 10, color: colors.muted }}>{trip.maxParcelWeightKg ?? trip.capacityKg} kg max per parcel</Txt></View><Button title={mode === "sender" ? own ? "Your route" : "Send this way ↗" : "Publish mine ↗"} small variant="secondary" disabled={mode === "sender" && own} onPress={onPress} /></View></Card>; }
function ShipmentRow({ shipment, onPress }: { shipment: Shipment; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={`View ${shipment.reference}, ${shipment.origin} to ${shipment.destination}`} onPress={onPress} style={({ pressed }) => [x.shipmentRow, pressed && { opacity: 0.7 }]}><View style={x.parcelIcon}><View style={{ width: 17, height: 19, borderWidth: 1.5, borderColor: "#9AA887", borderRadius: 3, transform: [{ rotate: "-9deg" }] }}><View style={{ position: "absolute", top: 0, bottom: 0, left: 7, width: 2, backgroundColor: "#9AA887" }} /></View></View><View style={{ flex: 1, minWidth: 0 }}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap", gap: 6 }]}><Txt style={{ fontSize: 12, fontWeight: "600" }}>{shipment.origin} → {shipment.destination}</Txt><Status status={shipment.status} /></View><Txt numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 7 }}>{shipment.reference} · {shipment.description}</Txt></View><Txt style={{ color: colors.muted, marginLeft: 5 }}>↗</Txt></Pressable>; }
function TrustCard({ onPress }: { onPress: () => void }) { return <View style={x.trustCard}><View style={x.trustIcon}><Txt style={{ fontSize: 23 }}>♧</Txt></View><Txt style={{ fontFamily: serif, fontSize: 25, lineHeight: 30, marginTop: 14 }}>A little trust.\nA long way.</Txt><Txt style={{ color: "#6C7B61", fontSize: 11, lineHeight: 20, marginTop: 12 }}>Verified people, declared parcels, and a one-time code at every handover. Thoughtful delivery starts here.</Txt><Button variant="ghost" title="Our safety promise  ↗" small onPress={onPress} style={{ alignItems: "flex-start", paddingHorizontal: 0, marginTop: 14 }} /></View>; }

function Matches({ mode, openForm, onDetail }: { mode: Mode; openForm: (kind: "shipment" | "trip", trip?: Trip) => void; onDetail: (id: string) => void }) {
  const { snapshot } = usePassenger(); const viewer = snapshot!.viewer!; const myTrips = snapshot!.trips.filter(t => t.travellerId === viewer.id && t.departureAt > Date.now());
  const parcels = snapshot!.shipments.filter(item => mode === "sender" ? item.senderId === viewer.id && ["open", "pending_review"].includes(item.status) : item.status === "open" && item.senderId !== viewer.id);
  return <><SectionTitle title={mode === "sender" ? "A companion for your parcel" : "Parcels that fit your plans"} subtitle={mode === "sender" ? "Route suggestions are not bookings. The traveller must accept your approved parcel before payment." : "Only accept approved parcels on your own trip. Both people must be verified, and the backend keeps the parcel fee fixed."} />{mode === "traveller" && <View style={{ marginBottom: 24 }}><View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}><Txt style={s.eyebrow}>YOUR UPCOMING TRIPS</Txt><Button title="+ Publish a trip" small variant="secondary" onPress={() => openForm("trip")} /></View>{myTrips.length === 0 ? <Notice>Publish your route to see which parcels you can take along.</Notice> : <View style={{ gap: 10 }}>{myTrips.map(t => <Card key={t.id} style={{ padding: 17 }}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><Txt style={{ fontSize: 13, fontWeight: "600" }}>{t.origin} → {t.destination}</Txt><Badge label={t.verified ? "Ready for matching" : "Verification pending"} tone={t.verified ? "green" : "amber"} /></View><Txt style={[s.muted, { marginTop: 8 }]}>{timeDate(t.departureAt)} · {tripAvailableCapacity(t)} kg left</Txt></Card>)}</View>}</View>}
    {parcels.length === 0 ? <Empty title={mode === "sender" ? "Let's give your parcel a route." : "No open parcels right now."} detail={mode === "sender" ? "Create a shipment to discover compatible upcoming trips. Approved parcels become visible to travellers." : "New parcels appear after review. Keep your upcoming trips published and check back soon."} action={mode === "sender" ? "Send a package" : "Publish a trip"} onAction={() => openForm(mode === "sender" ? "shipment" : "trip")} /> : <View style={{ gap: 17 }}>{parcels.map(item => {
      const matching = findMatchingTrips(item, mode === "sender" ? snapshot!.trips.filter(t => t.travellerId !== viewer.id) : myTrips);
      return <Card key={item.id}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><Txt style={s.h3}>{item.origin} → {item.destination}</Txt><Status status={item.status} /></View><Txt style={{ fontSize: 13, marginTop: 14 }}>{item.description}</Txt><Txt style={[s.muted, { marginTop: 6 }]}>{item.weightKg} kg · {item.category} · delivery fee {money(item.feeNaira)}</Txt><View style={s.divider} />{item.status === "pending_review" ? <Txt style={s.muted}>Your declared contents are awaiting review. Matching unlocks after approval.</Txt> : matching.length === 0 ? <Txt style={s.muted}>No matching trip with enough remaining capacity yet.</Txt> : <View style={{ gap: 10 }}>{matching.slice(0, 3).map(t => <View key={t.id} style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><View style={[s.row, { gap: 8 }]}><Avatar name={t.travellerName} size={27} /><Txt style={{ fontSize: 11 }}>{mode === "traveller" ? "Your trip" : t.travellerName} · {timeDate(t.departureAt)}</Txt></View><Badge label={`${tripAvailableCapacity(t)} kg available`} /></View>)}</View>}<Button title={mode === "sender" ? "View parcel & next steps  ↗" : "Review parcel & accept  ↗"} variant="secondary" onPress={() => onDetail(item.id)} style={{ marginTop: 17 }} /></Card>;
    })}</View>}
  </>;
}
function Activity({ mode, openForm, onDetail }: { mode: Mode; openForm: (kind: "shipment" | "trip") => void; onDetail: (id: string) => void }) {
  const { snapshot } = usePassenger(); const viewer = snapshot!.viewer!; const [filter, setFilter] = useState("All");
  const parcels = snapshot!.shipments.filter(item => mode === "sender" ? item.senderId === viewer.id : item.travellerId === viewer.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const visible = parcels.filter(item => filter === "All" || (filter === "Active" ? !["delivered", "cancelled", "disputed"].includes(item.status) : filter === "Delivered" ? item.status === "delivered" : filter === "Disputed" ? item.status === "disputed" : item.status === "cancelled"));
  const emptyDetail = filter === "All" ? "Start with your first parcel." : filter === "Delivered" || filter === "Cancelled" ? "" : `No ${filter.toLowerCase()} items.`;
  return <><SectionTitle title={mode === "sender" ? "Sending" : "Carrying"} />{mode === "traveller" && <MyTrips onCreate={() => openForm("trip")} />}<View style={[s.wrap, { marginBottom: 23 }]}>{["All", "Active", "Delivered", "Disputed", "Cancelled"].map(f => <Button key={f} title={f === "All" ? `All (${parcels.length})` : f} small variant={filter === f ? "primary" : "secondary"} onPress={() => setFilter(f)} />)}</View>{visible.length === 0 ? <Empty title="Nothing here yet." detail={emptyDetail} action={filter === "All" ? mode === "sender" ? "Send a package" : "Publish a trip" : "Show all"} onAction={() => filter === "All" ? openForm(mode === "sender" ? "shipment" : "trip") : setFilter("All")} /> : <View style={{ gap: 12 }}>{visible.map(item => <ShipmentRow key={item.id} shipment={item} onPress={() => onDetail(item.id)} />)}</View>}</>;
}

function ProfileBootstrap() {
  const data = usePassenger();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const bootstrap = async () => {
    setBusy(true);
    setError("");
    try {
      await data.bootstrapProfile();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  return <Centered title="Setting up your account." detail="Passenger is preparing your profile from your signed-in account."><View style={{ width: "100%", marginTop: 12 }}>{busy ? <ActivityIndicator color={colors.forest} /> : null}{error !== "" && <View style={{ marginBottom: 16 }}><Notice tone="error">{error}</Notice></View>}<Button title="Try again" busy={busy} disabled={busy} onPress={() => void bootstrap()} /><Button title="Sign out" variant="ghost" onPress={() => void data.signOut().catch(e => setError(errorMessage(e)))} /></View></Centered>;
}
export function Centered({ title, detail, children }: React.PropsWithChildren<{ title: string; detail: string }>) { return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 28, paddingHorizontal: HORIZONTAL_PADDING }}><View style={{ maxWidth: 440, width: "100%", gap: 17 }}><Logo /><Txt style={{ fontFamily: serif, fontSize: 37, lineHeight: 44, marginTop: 20 }}>{title}</Txt><Txt style={[s.muted, { fontSize: 14, lineHeight: 23 }]}>{detail}</Txt>{children}</View></ScrollView></SafeAreaView>; }
function Safety({ onClose }: { onClose: () => void }) { return <Sheet title="Good hands. Clear expectations." eyebrow="THE PASSENGER SAFETY GUIDE" onClose={onClose}><Txt style={[s.muted, { marginBottom: 22 }]}>Passenger connects senders with people already travelling. It is a parcel marketplace, not a passenger transport service or an insurance policy.</Txt>{[
  ["01", "Know who's going", "Both sender and traveller must pass manual identity review before matching. A verified badge means the review was completed; it is not a guarantee against loss or misconduct."],
  ["02", "Say exactly what's inside", "Declare every item, its weight and value. Operations reviews parcels before they appear to travellers. Weapons, illegal drugs, cash, hazardous materials, stolen goods and live animals are prohibited."],
  ["03", "Match first. Pay securely.", "The traveller accepts an approved parcel on their own compatible trip. The sender then pays through the external payment provider. Never collect a parcel based on a screenshot, promise or off-platform transfer. Wait for the confirmed funded status."],
  ["04", "Hand over in person", "Meet in a safe public place, inspect the declared contents together, and refuse anything that does not match. The sender shares the one-time handover code only when physically handing over the parcel."],
  ["05", "A private code for the receiver", "The sender generates a separate delivery code and privately relays it to the receiver, never directly to the traveller. The receiver shares it only after inspecting and receiving the parcel. Delivery confirmation does not automatically release the payout."],
  ["06", "Milestones, not a moving dot", "Tracking records confirmed actions and timestamps. Passenger does not show live GPS, collect a background location, or invent a vehicle position. Coordinate exact meeting arrangements directly with the other participant."],
  ["07", "If something isn't right", "Open the delivery and raise a dispute with a clear description. Operations reviews milestones and holds payouts while the dispute is unresolved. Do not include private codes in a dispute. Declared value is not insurance or a compensation promise."],
].map(([number, title, detail]) => <View key={number} style={{ flexDirection: "row", gap: 15, marginBottom: 23 }}><View style={{ backgroundColor: colors.soft, width: 30, height: 30, borderRadius: 10, justifyContent: "center", alignItems: "center" }}><Txt style={{ fontSize: 10, fontWeight: "600" }}>{number}</Txt></View><View style={{ flex: 1 }}><Txt style={{ fontSize: 14, fontWeight: "600", marginBottom: 7 }}>{title}</Txt><Txt style={[s.muted, { lineHeight: 21 }]}>{detail}</Txt></View></View>)}<Button title="A little care goes a long way  ✓" onPress={onClose} /></Sheet>; }

const x = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  sidebar: { width: 220, backgroundColor: "#FCFCF7", borderRightWidth: 1, borderRightColor: colors.border, paddingTop: 33, paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 18 }, navItem: { flexDirection: "row", gap: 11, alignItems: "center", paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, minHeight: 46 }, sideTip: { backgroundColor: "#F0F2E7", borderRadius: 13, padding: 17, marginTop: 35 }, tipCircle: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#DFE8CB", justifyContent: "center", alignItems: "center" }, sidebarProfile: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 20, marginTop: 21, borderTopWidth: 1, borderTopColor: colors.border },
  topbar: { height: 75, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: HORIZONTAL_PADDING, backgroundColor: "#FAFAF5" }, topbarDivider: { height: 19, width: 1, backgroundColor: colors.border }, scroll: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 32, paddingBottom: 12 }, content: { width: "100%", maxWidth: 1200, alignSelf: "center" }, welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 27 }, welcome: { fontSize: 30, letterSpacing: -1, fontWeight: "500" }, modeSwitch: { flexDirection: "row", backgroundColor: "#ECEFE5", padding: 4, borderRadius: 11 }, modeButton: { paddingHorizontal: 13, paddingVertical: 11, borderRadius: 8 }, modeActive: { backgroundColor: colors.forest },
  hero: { backgroundColor: colors.forest, borderRadius: 19, flexDirection: "row", overflow: "hidden", minHeight: 295 }, heroTag: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 18 }, heroHeadline: { fontFamily: serif, color: "#F6F7E9", letterSpacing: -1.5 }, heroCopy: { color: "#C0D1BD", fontSize: 12, lineHeight: 21, marginTop: 16, maxWidth: 350 }, artOrbit: { position: "absolute", height: 250, width: 185, borderWidth: 1, borderStyle: "dashed", borderColor: "#4B684B", borderRadius: 150, transform: [{ rotate: "-35deg" }] }, artCity: { position: "absolute", top: 38, left: 25, flexDirection: "row", alignItems: "center", gap: 7 }, parcel: { width: 133, height: 139, borderRadius: 5, backgroundColor: "#D8BD8C", transform: [{ rotate: "-12deg" }], borderBottomWidth: 12, borderBottomColor: "#BDA272", borderRightWidth: 8, borderRightColor: "#B59C71", overflow: "hidden" }, parcelTape: { position: "absolute", left: 47, top: 0, bottom: 0, width: 24, backgroundColor: "#E8D7B3" }, parcelLabel: { position: "absolute", top: 44, right: 15, width: 67, height: 74, backgroundColor: "#F7F5E6", borderRadius: 3, padding: 8, alignItems: "center", gap: 2 }, parcelShadow: { position: "absolute", width: 139, height: 30, borderRadius: 90, bottom: 69, backgroundColor: "#14352B", transform: [{ rotate: "-12deg" }] }, artStamp: { position: "absolute", backgroundColor: colors.lime, height: 43, width: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", right: 21, bottom: 74, borderWidth: 5, borderColor: colors.forest }, stats: { flexDirection: "row", gap: 12 },
  searchBox: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 19, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 17 }, searchLabel: { color: colors.muted, fontSize: 8, letterSpacing: 1.5, marginBottom: 2 }, swap: { borderWidth: 1, borderColor: colors.border, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, routeChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }, shipmentRow: { padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, parcelIcon: { width: 39, height: 43, backgroundColor: "#F2F3EB", borderRadius: 10, alignItems: "center", justifyContent: "center" }, trustCard: { backgroundColor: "#E9EFDB", borderRadius: 16, padding: 24 }, trustIcon: { height: 38, width: 38, borderRadius: 13, borderWidth: 1, borderColor: "#CFD9B9", justifyContent: "center", alignItems: "center" }, footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 15, marginTop: 47, paddingTop: 23, paddingBottom: 22, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: "wrap" },
  bottomNav: { flexDirection: "row", backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, paddingBottom: Platform.OS === "web" ? 10 : 5, paddingHorizontal: 8 },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 54, gap: 4 },
  bottomNavLabel: { color: "#B4AFBC", fontSize: 12, lineHeight: 17, fontFamily: "WorkSansRegular" },
  bottomNavLabelActive: { color: colors.lime, fontFamily: "WorkSansMedium" },
  fab: {
    position: "absolute",
    bottom: 85,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  toastBanner: {
    backgroundColor: "#22C55E",
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  toastIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  toastCheckmark: {
    color: "#22C55E",
    fontSize: 13,
    fontFamily: "WorkSansSemiBold",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "WorkSansSemiBold",
  },
});
