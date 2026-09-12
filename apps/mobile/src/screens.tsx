import { semantic } from "@passenger/design-tokens";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRight, ArrowUpRight, Bell, CheckCircle2, Clock3, Home as HomeIcon, Repeat2, Route, Send, ShieldCheck, Sparkles, User, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { usePaginatedQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { findMatchingTrips, money, shipmentActions } from "@passenger/core";
import type { CreateShipmentInput, Shipment, Trip } from "@passenger/core";
import { usePassenger } from "./data";
import { DeliveryDetail } from "./delivery";
import { MobileHome } from "./mobile-home";
import { MobileTripsScreen } from "./mobile-trips";
import { PhoneVerificationHome } from "./phone-verification";
import { Profile } from "./profile";
import { IdentityVerificationCard } from "./identity-verification-card";
import { NotificationsScreen } from "./sender-deliveries";
import { SupportHub } from "./support";
import { ShipmentForm, TripForm } from "./forms";
import { getPendingEvidenceResumeKey } from "./evidence";
import { NavigationIllustration } from "./illustrations";
import type { NavigationIllustrationName } from "./illustrations";
import { BackButton, AppLoadingScreen, Avatar, Badge, Button, Card, colors, Empty, errorMessage, Field, FullScreenState, Notice, RouteLine, s, ScreenSkeleton, SectionTitle, serif, Sheet, shortDate, Status, timeDate, Txt } from "./ui";

type Page = "home" | "routes" | "matches" | "notifications" | "profile";
type Mode = "sender" | "traveller";
const nav: { id: Page; title: string; icon: LucideIcon }[] = [{ id: "home", title: "Home", icon: HomeIcon }, { id: "routes", title: "Find routes", icon: Route }, { id: "matches", title: "Matches", icon: ArrowRight }, { id: "notifications", title: "Notifications", icon: Bell }, { id: "profile", title: "My profile", icon: User }];
const HORIZONTAL_PADDING = 18;

export function PassengerShell() {
  const data = usePassenger(); const { width } = useWindowDimensions(); const desktop = width >= 1000; const roomy = width >= 1250;
  const [page, setPage] = useState<Page>("home"); const [mode, setMode] = useState<Mode>("sender"); const [form, setForm] = useState<"shipment" | "trip" | null>(null); const [prefill, setPrefill] = useState<Trip | undefined>(); const [prefillDraft, setPrefillDraft] = useState<Partial<CreateShipmentInput> | undefined>(); const [editingShipment, setEditingShipment] = useState<Shipment | undefined>(); const [selected, setSelected] = useState<string | null>(null); const [safety, setSafety] = useState(false); const [toast, setToast] = useState(""); const [phoneVerificationCelebration, setPhoneVerificationCelebration] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        if (form === "shipment") return;
        const pendingResume = await getPendingEvidenceResumeKey();
        if (pendingResume !== "shipment-form") return;
        setMode("sender");
        setForm("shipment");
      } catch {
        // Ignore resume key retrieval failure
      }
    })();
  }, [form]);
  const snapshot = data.snapshot;
  const activationDestination = snapshot?.viewer?.activationDestination;
  useEffect(() => {
    if (activationDestination !== "routes") return;
    setPage("routes");
    void data.completeActivation().catch(error => setToast(errorMessage(error)));
  }, [activationDestination, data.completeActivation]);
  if (data.authError) return <FullScreenState title="Sign-in required" subtitle="Your session ended. Sign in again to continue." primaryAction={{ label: "Sign in again", onPress: () => void data.signOut().catch(() => undefined) }} />;
  if (!snapshot || data.authLoading) return <AppLoadingScreen />;
  if (!snapshot.viewer) return <ProfileBootstrap />;
  const viewer = snapshot.viewer;
  if (viewer.activationDestination === "name") return <NameOnboarding />;
  const openForm = (kind: "shipment" | "trip", trip?: Trip, draft?: Partial<CreateShipmentInput>) => { setEditingShipment(undefined); setPrefill(trip); setPrefillDraft(draft); setForm(kind); };
  const openShipmentEdit = (shipment: Shipment) => { setSelected(null); setPrefill(undefined); setPrefillDraft(undefined); setEditingShipment(shipment); setForm("shipment"); };
  const openTripCreation = () => {
    setMode("traveller");
    openForm("trip");
  };
  const closeForm = () => { setForm(null); setEditingShipment(undefined); setPrefill(undefined); setPrefillDraft(undefined); };
  const phoneVerified = !!viewer.phoneVerificationTime;
  const mobileNavigation = <MobileNavigation page={page} onSelect={setPage} />;
  const selectedShipment = snapshot.shipments.find(item => item.id === selected);
  if (page === "notifications") return <SafeAreaView style={x.safe} edges={["top", "bottom"]}>
    <NotificationsScreen navigation={desktop ? <BackButton accessibilityLabel="Back to home" onPress={() => setPage("home")} /> : mobileNavigation} notice={toast} onNoticeDismiss={() => setToast("")} />
  </SafeAreaView>;
  if (!desktop) {
    const mobileContent = page === "home"
      ? (!phoneVerified || phoneVerificationCelebration
          ? <PhoneVerificationHome viewer={viewer} celebrating={phoneVerificationCelebration} navigation={mobileNavigation} onCelebrationChange={setPhoneVerificationCelebration} onFindTravellers={() => setPage("routes")} onScheduleTrip={openTripCreation} onOpenNotifications={() => setPage("notifications")} onSafety={() => setSafety(true)} />
          : <MobileHome
              viewer={viewer}
              navigation={mobileNavigation}
              onBookTrip={(trip, draft) => { setPage("routes"); openForm("shipment", trip, draft); }}
              onOpenNotifications={() => setPage("notifications")}
              onSafety={() => setSafety(true)}
              onSendParcel={() => { setMode("sender"); openForm("shipment"); }}
              onScheduleTrip={openTripCreation}
              onOpenDelivery={setSelected}
            />)
      : page === "routes"
          ? <MobileTripsScreen notice={toast} navigation={mobileNavigation} onTripScheduled={() => { setMode("traveller"); setToast("Your trip is published. You can find it under upcoming trips."); }} />
          : <Profile viewer={viewer} navigation={mobileNavigation} onToast={setToast} onSafety={() => setSafety(true)} onOpenDelivery={setSelected} onStartEarning={openTripCreation} />;

    return <SafeAreaView style={x.safe} edges={["top", "bottom"]}>
      {page === "home" && toast ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss confirmation" onPress={() => setToast("")} style={{ padding: HORIZONTAL_PADDING }}><Notice tone="success">{toast}</Notice></Pressable> : null}
      {mobileContent}
      {selectedShipment && <DeliveryDetail key={`${viewer.id}:${selectedShipment.id}`} shipment={selectedShipment} onClose={() => setSelected(null)} onEdit={shipmentActions(selectedShipment, viewer).edit ? () => openShipmentEdit(selectedShipment) : undefined} />}
      {safety && <SupportHub onClose={() => setSafety(false)} onOpenDelivery={id => { setSafety(false); setSelected(id); }} />}
      {form === "shipment" && <ShipmentForm shipment={editingShipment} trip={prefill} draft={prefillDraft} onClose={closeForm} onSuccess={() => { const wasEditingShipment = !!editingShipment; closeForm(); setPage("home"); setMode("sender"); setToast(wasEditingShipment ? "Your parcel was updated and resubmitted for review." : "Your parcel is submitted for review. We'll notify you when it's reviewed."); }} />}
      {form === "trip" && <TripForm onClose={() => setForm(null)} onSuccess={() => { setForm(null); setMode("traveller"); setToast("Your trip is published. You can find it under upcoming trips."); }} />}
    </SafeAreaView>;
  }
  const mine = snapshot.shipments.filter(item => mode === "sender" ? item.senderId === viewer.id : item.travellerId === viewer.id);
  const active = mine.filter(item => !["delivered", "cancelled"].includes(item.status));
  const myTrips = snapshot.trips.filter(t => t.travellerId === viewer.id && t.departureAt > Date.now());
  const contentProps = { mode, openForm, onDetail: setSelected };
  return <SafeAreaView style={x.safe} edges={["top", "bottom"]}>
    {data.offline && <Notice tone="warning">You're offline. These are the last received records; reconnect before making changes.</Notice>}
    <View style={{ flex: 1, flexDirection: "row" }}>
      {desktop && <View style={x.sidebar}><Logo /><View style={{ marginTop: 43, gap: 8 }}>{nav.map(item => <NavItem key={item.id} item={item} active={page === item.id} onPress={() => setPage(item.id)} />)}</View><View style={{ flex: 1 }} /><View style={x.sideTip}><View style={x.tipCircle}><Sparkles size={22} color={colors.forest} /></View><Txt style={{ fontWeight: "600", fontSize: 13, marginTop: 12 }}>A little space. A big help.</Txt><Txt style={[s.muted, { fontSize: 11, marginTop: 7, lineHeight: 18 }]}>Your next trip could make someone's day.</Txt><Button title="Share your route" icon={<ArrowUpRight size={15} color={colors.forest} />} variant="ghost" small onPress={() => { setMode("traveller"); openForm("trip"); }} style={{ paddingHorizontal: 0, alignItems: "flex-start", marginTop: 6 }} /></View><Pressable accessibilityRole="button" onPress={() => setSafety(true)} style={[s.row, { marginTop: 27, padding: 8 }]}><ShieldCheck size={17} color={colors.muted} /><Txt style={{ fontSize: 12, color: colors.muted }}>Trust & safety</Txt></Pressable><View style={x.sidebarProfile}><Avatar name={viewer.name} size={35} /><View style={{ flex: 1 }}><Txt numberOfLines={1} style={{ fontSize: 12, fontWeight: "600" }}>{viewer.name}</Txt><Txt style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>Passenger member</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Open my profile" onPress={() => setPage("profile")}><ArrowUpRight size={16} color={colors.text} /></Pressable></View></View>}
      <View style={{ flex: 1, minWidth: 0 }}><View style={x.topbar}>{desktop ? <Txt style={{ fontSize: 13, fontWeight: "600" }}>{nav.find(n => n.id === page)?.title}</Txt> : <Logo compact />}<View style={s.row}><Pressable accessibilityRole="button" onPress={() => setSafety(true)} style={{ padding: 8 }}><Txt style={{ fontSize: 11, color: colors.muted }}>{desktop ? "How Passenger works" : "How it works"}</Txt></Pressable><View style={x.topbarDivider} /><Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => setPage("profile")}><Avatar name={viewer.name} size={34} /></Pressable></View></View>
        <ScrollView contentContainerStyle={[x.scroll, !desktop && { paddingTop: 25 }]} keyboardShouldPersistTaps="handled"><View style={x.content}>
          <View style={[x.welcomeRow, width < 620 && { alignItems: "flex-start", flexDirection: "column", gap: 17 }]}><View><View style={s.row}><Txt style={x.welcome}>{page === "home" ? `Hello, ${viewer.name.split(" ")[0]}.` : page === "routes" ? "Going your way." : page === "matches" ? "Better, together." : "You're part of the journey."}</Txt>{page === "home" ? <Sparkles size={20} color="#96A16E" /> : null}</View></View><View style={x.modeSwitch}>{(["sender", "traveller"] as Mode[]).map(value => <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === value }} key={value} onPress={() => { setMode(value); setToast(""); }} style={[x.modeButton, mode === value && x.modeActive]}>{value === "sender" ? <Send size={14} color={mode === value ? "white" : colors.muted} /> : <Route size={14} color={mode === value ? "white" : colors.muted} />}<Txt style={{ color: mode === value ? "white" : colors.muted, fontSize: 11, fontWeight: "600" }}>{value === "sender" ? "I'm sending" : "I'm travelling"}</Txt></Pressable>)}</View></View>
          {toast !== "" && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setToast("")} style={{ marginBottom: 20 }}><Notice tone="success"><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Txt>{toast}</Txt><X size={16} color={colors.muted} /></View></Notice></Pressable>}
          {viewer.verification !== "verified" && page !== "profile" && <IdentityVerificationCard viewer={viewer} />}
          {page === "home" && <>
            <Hero mode={mode} compact={!roomy} onCreate={() => openForm(mode === "sender" ? "shipment" : "trip")} onLearn={() => setSafety(true)} />
            <View style={[x.stats, { marginTop: 24 }]}><Stat icon={Send} value={String(active.length).padStart(2, "0")} title={mode === "sender" ? "Active deliveries" : "Parcels to carry"} foot="A little closer, every step" /><Stat icon={Route} value={String(mode === "sender" ? mine.filter(item => item.status === "open").length : myTrips.length).padStart(2, "0")} title={mode === "sender" ? "Open parcels" : "Upcoming trips"} foot={mode === "sender" ? "Ready to find a route" : "Your spare space, put to use"} /><Stat icon={CheckCircle2} value={String(mine.filter(item => item.status === "delivered").length).padStart(2, "0")} title="Safely delivered" foot="Good things in good hands" /></View>
            <View style={{ marginTop: 34 }}><RouteBrowser mode={mode} onCreate={openForm} compact onAll={() => setPage("routes")} /></View>
            <View style={[roomy ? { flexDirection: "row", alignItems: "flex-start", gap: 24 } : { gap: 24 }, { marginTop: 34 }]}><View style={{ flex: 1 }}><SectionTitle title={mode === "sender" ? "Your parcels, at a glance" : "On your journey"} action="View all" onAction={() => setPage("profile")} />{mine.length === 0 ? <Empty title="Your first chapter starts here." detail={mode === "sender" ? "Send a parcel and follow each confirmed milestone here." : "Accepted parcels and their milestones will appear here."} action={mode === "sender" ? "Send a package" : "Browse matches"} onAction={() => mode === "sender" ? openForm("shipment") : setPage("matches")} /> : <View style={{ gap: 12 }}>{mine.slice(0, 3).map(item => <ShipmentRow key={item.id} shipment={item} onPress={() => setSelected(item.id)} />)}</View>}</View><View style={roomy ? { width: 265 } : undefined}><TrustCard onPress={() => setSafety(true)} /></View></View>
          </>}
          {page === "routes" && <RouteBrowser mode={mode} onCreate={openForm} />}
          {page === "matches" && <Matches {...contentProps} />}
          {page === "profile" && <View style={{ gap: 24 }}><Profile key={viewer.id} onStartEarning={openTripCreation} onToast={setToast} onSafety={() => setSafety(true)} onOpenDelivery={setSelected} /></View>}
          <View style={x.footer}><Logo compact muted /><Txt style={{ fontSize: 10, color: "#90988B" }}>Good things, going places.</Txt><Pressable accessibilityRole="button" onPress={() => setSafety(true)} style={s.row}><Txt style={{ fontSize: 10, color: colors.muted }}>Made for trust</Txt><ArrowUpRight size={12} color={colors.muted} /></Pressable></View>
        </View></ScrollView>
        {!desktop && mobileNavigation}
      </View>
    </View>
    {form === "shipment" && <ShipmentForm shipment={editingShipment} trip={prefill} draft={prefillDraft} onClose={() => { setForm(null); setEditingShipment(undefined); setPrefill(undefined); setPrefillDraft(undefined); }} onSuccess={() => { const wasEditingShipment = !!editingShipment; setForm(null); setEditingShipment(undefined); setPrefill(undefined); setPrefillDraft(undefined); setPage("home"); setMode("sender"); setToast(wasEditingShipment ? "Your parcel was updated and resubmitted for review." : "Your parcel is submitted for review. We'll notify you when it's reviewed."); }} />}
    {form === "trip" && <TripForm onClose={() => setForm(null)} onSuccess={() => { setForm(null); setMode("traveller"); setToast("Your trip is published. You can find it under upcoming trips."); }} />}
    {selectedShipment && <DeliveryDetail key={`${viewer.id}:${selectedShipment.id}`} shipment={selectedShipment} onClose={() => setSelected(null)} onEdit={shipmentActions(selectedShipment, viewer).edit ? () => openShipmentEdit(selectedShipment) : undefined} />}
    {safety && <SupportHub onClose={() => setSafety(false)} onOpenDelivery={id => { setSafety(false); setSelected(id); }} />}
  </SafeAreaView>;
}

function Logo({ compact, muted }: { compact?: boolean; muted?: boolean }) { return <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 6 : 9, opacity: muted ? 0.55 : 1 }}><View style={{ height: compact ? 26 : 33, width: compact ? 26 : 33, borderRadius: 9, backgroundColor: colors.forest, justifyContent: "center", alignItems: "center" }}><Send size={compact ? 17 : 22} color={colors.lime} /></View><Txt style={{ fontSize: compact ? 18 : 24, fontWeight: "700", letterSpacing: -1 }}>passenger<Txt style={{ color: "#94AB5C" }}>.</Txt></Txt></View>; }
function NavItem({ item, active, onPress, count }: { item: typeof nav[number]; active: boolean; onPress: () => void; count?: number }) { const Icon = item.icon; return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[x.navItem, active && { backgroundColor: colors.forest }]}><Icon size={20} color={active ? colors.lime : colors.muted} /><Txt style={{ color: active ? "white" : "#6B786D", fontSize: 12, flex: 1, fontWeight: active ? "600" : "400" }}>{item.title}</Txt>{count !== undefined && count > 0 && <View style={{ backgroundColor: active ? colors.lime : colors.soft, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }}><Txt style={{ fontSize: 9 }}>{count}</Txt></View>}</Pressable>; }
const mobileNav: { id: Page; title: string; illustration: NavigationIllustrationName }[] = [
  { id: "home", title: "Home", illustration: "home" },
  { id: "routes", title: "Trips", illustration: "trips" },
  { id: "profile", title: "Profile", illustration: "profile" },
];
function MobileNavigation({ page, onSelect }: { page: Page; onSelect: (page: Page) => void }) {
  return <View style={x.bottomNav}>{mobileNav.map(item => {
    const active = page === item.id;
    return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: active }} onPress={() => onSelect(item.id)} style={x.bottomNavItem}>
      <View style={[x.bottomNavIcon, active && x.bottomNavIconActive]}><NavigationIllustration name={item.illustration} size={30} style={!active ? x.bottomNavIconInactive : undefined} /></View>
      <Txt numberOfLines={1} style={[x.bottomNavLabel, active && x.bottomNavLabelActive]}>{item.title}</Txt>
    </Pressable>;
  })}</View>;
}

function Hero({ mode, compact, onCreate, onLearn }: { mode: Mode; compact: boolean; onCreate: () => void; onLearn: () => void }) {
  const { width } = useWindowDimensions(); const showArt = width > 650;
  return <View style={x.hero}><View style={{ flex: 1, padding: compact ? 27 : 37, zIndex: 1 }}><Txt style={[x.heroHeadline, { fontSize: width < 430 ? 35 : compact ? 40 : 48, lineHeight: width < 430 ? 43 : compact ? 48 : 55 }]}>{mode === "sender" ? "Your parcel.\nSomeone’s journey." : "You're going places.\nTake a little good."}</Txt><Txt style={x.heroCopy}>{mode === "sender" ? "Connect with verified travellers already heading your way. A thoughtful way to send, city to city." : "Turn the space in your bag into someone's delivery. Share your route and earn along the way."}</Txt><View style={[s.row, { marginTop: 24, flexWrap: "wrap" }]}><Button variant="lime" title={mode === "sender" ? "Send a package" : "Publish a trip"} icon={<ArrowUpRight size={16} color="white" />} onPress={onCreate} /><Pressable accessibilityRole="button" onPress={onLearn} style={[s.row, { paddingVertical: 12 }]}><Txt style={{ color: "#CDD9C7", fontSize: 11 }}>Here's how it works</Txt><ArrowRight size={14} color="#CDD9C7" /></Pressable></View></View>{showArt && <ParcelArt compact={compact} />}</View>;
}
function ParcelArt({ compact }: { compact: boolean }) { return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: compact ? 205 : 260, alignItems: "center", justifyContent: "center", overflow: "hidden" }}><View style={x.artOrbit} /><View style={[x.artOrbit, { height: 135, width: 220, transform: [{ rotate: "-35deg" }], borderColor: "#426148" }]} /><View style={x.artCity}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.lime }} /><Txt style={{ fontSize: 10, color: "#CBDAC0" }}>Jos</Txt></View><View style={[x.artCity, { bottom: 43, top: undefined, left: 12 }]}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.lime }} /><Txt style={{ fontSize: 10, color: "#CBDAC0" }}>Abuja</Txt></View><View style={x.parcelShadow} /><View style={x.parcel}><View style={x.parcelTape} /><View style={x.parcelLabel}><Txt style={{ fontSize: 8, fontWeight: "700", letterSpacing: 1.2 }}>WITH CARE.</Txt><Send size={26} color={colors.forest} /><View style={{ flexDirection: "row", gap: 2, height: 13 }}>{Array.from({ length: 12 }, (_, i) => <View key={i} style={{ width: i % 3 === 0 ? 3 : 1, height: 13, backgroundColor: colors.forest }} />)}</View></View></View><View style={x.artStamp}><CheckCircle2 size={19} color={colors.forest} /></View><View style={{ position: "absolute", top: 37, right: 22 }}><Sparkles size={24} color={colors.lime} /></View></View>; }
function Stat({ icon: Icon, value, title, foot }: { icon: LucideIcon; value: string; title: string; foot: string }) { const { width } = useWindowDimensions(); return <Card style={{ flex: 1, minWidth: 0, padding: width < 550 ? 13 : 21 }}><View style={[s.row, { justifyContent: "space-between", gap: 4 }]}><Txt style={{ fontSize: width < 550 ? 27 : 31, fontWeight: "500", letterSpacing: -1 }}>{value}</Txt><View style={{ width: width < 550 ? 26 : 34, height: width < 550 ? 26 : 34, borderRadius: 11, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" }}><Icon size={18} color={colors.forest} /></View></View><Txt style={{ fontSize: width < 550 ? 10 : 12, fontWeight: "600", marginTop: 13, lineHeight: 16 }}>{title}</Txt>{width >= 550 && <Txt style={{ fontSize: 10, color: colors.muted, marginTop: 5 }}>{foot}</Txt>}</Card>; }

function RouteBrowser({ mode, onCreate, compact, onAll }: { mode: Mode; onCreate: (kind: "shipment" | "trip", trip?: Trip) => void; compact?: boolean; onAll?: () => void }) {
  const { results: availableTrips, status, loadMore } = usePaginatedQuery(api.marketplace.availableTripsPage, {}, { initialNumItems: 30 });
  const { width } = useWindowDimensions();
  const [origin, setOrigin] = useState(""); const [destination, setDestination] = useState(""); const [query, setQuery] = useState<{ origin: string; destination: string } | null>(null); const [error, setError] = useState("");
  const trips = availableTrips.filter(t => tripAvailableCapacity(t) > 0 && (!query || (!query.origin || t.origin.toLowerCase().includes(query.origin.toLowerCase())) && (!query.destination || t.destination.toLowerCase().includes(query.destination.toLowerCase()))));
  const submit = () => { if (origin.trim() && destination.trim() && origin.trim().toLowerCase() === destination.trim().toLowerCase()) { setError("Choose different origin and destination cities."); return; } setError(""); setQuery({ origin: origin.trim(), destination: destination.trim() }); };
  const visible = compact && !query ? trips.slice(0, 3) : trips;
  return <><SectionTitle title={compact ? "Find a journey for your parcel" : "A route for every little thing."} subtitle={compact ? "Real people. Familiar routes. A little room for your package." : "Browse upcoming trips from verified travellers. Times are shown in your local timezone."} action={compact ? "All routes" : undefined} onAction={onAll} />
    <View style={[x.searchBox, width < 650 && { flexWrap: "wrap" }]}><View style={{ flex: 1, minWidth: 100 }}><Txt style={x.searchLabel}>FROM</Txt><SearchInput label="Search departure city" value={origin} onChange={setOrigin} placeholder="Any city" /></View><Pressable accessibilityRole="button" accessibilityLabel="Swap origin and destination" onPress={() => { setOrigin(destination); setDestination(origin); }} style={x.swap}><Repeat2 size={18} color="#788A71" /></Pressable><View style={{ flex: 1, minWidth: 100 }}><Txt style={x.searchLabel}>TO</Txt><SearchInput label="Search destination city" value={destination} onChange={setDestination} placeholder="Any city" /></View><Button title="Find routes" icon={<ArrowRight size={15} color="white" />} onPress={submit} style={width < 650 ? { width: "100%" } : { minWidth: 130 }} /></View>
    {error !== "" && <View style={{ marginTop: 12 }}><Notice tone="error">{error}</Notice></View>}
    <View style={[s.row, { marginTop: 14, marginBottom: 17, flexWrap: "wrap", gap: 8 }]}><Txt style={{ fontSize: 10, color: colors.muted }}>POPULAR</Txt>{[{ origin: "Jos", destination: "Abuja" }, { origin: "Lagos", destination: "Ibadan" }, { origin: "Abuja", destination: "Kaduna" }].map(route => <Pressable key={route.origin} accessibilityRole="button" onPress={() => { setOrigin(route.origin); setDestination(route.destination); setQuery(route); setError(""); }} style={[x.routeChip, s.row]}><Txt style={{ fontSize: 10, color: colors.muted }}>{route.origin}</Txt><ArrowRight size={12} color={colors.muted} /><Txt style={{ fontSize: 10, color: colors.muted }}>{route.destination}</Txt></Pressable>)}{query && <Button variant="ghost" small title="Clear filters" icon={<X size={14} color={colors.text} />} onPress={() => { setQuery(null); setOrigin(""); setDestination(""); setError(""); }} />}</View>
    {query && <Txt accessibilityLiveRegion="polite" style={[s.muted, { marginBottom: 13 }]}>{trips.length} {trips.length === 1 ? "journey" : "journeys"} found</Txt>}
    {visible.length === 0
      ? <Empty illustration="routesEmpty" title="No journeys on this route. Yet." detail="Try another city pair, check back later, or publish a trip and be the first to make room." action="Publish a trip" onAction={() => onCreate("trip")} />
      : <View style={[s.wrap, { gap: 15 }]}>
          {visible.map(trip => (<TripCard key={trip.id} trip={trip} compact={compact} onPress={() => onCreate(mode === "traveller" ? "trip" : "shipment", mode === "sender" ? trip : undefined)} mode={mode} />))}
        </View>}
    {!compact && status === "CanLoadMore" ? <Button title="Load more routes" variant="secondary" onPress={() => loadMore(30)} /> : null}
  </>;
}
function SearchInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9AA291" style={{ fontSize: 14, fontWeight: "500", color: colors.text, paddingVertical: 5, minHeight: 32 }} />; }
function tripAvailableCapacity(trip: Trip) { const reserved = trip.legReservedKg?.length ? Math.max(...trip.legReservedKg) : trip.reservedKg ?? 0; return Math.max(0, trip.capacityKg - reserved); }
function TripCard({ trip, onPress, mode }: { trip: Trip; onPress: () => void; mode: Mode; compact?: boolean }) { const data = usePassenger(); const { width } = useWindowDimensions(); const own = trip.travellerId === data.snapshot?.viewer?.id; return <Card style={{ flexGrow: 1, flexBasis: width < 600 ? "100%" : 220, padding: 20 }}><View style={[s.row, { justifyContent: "space-between", marginBottom: 22 }]}><View style={[s.row, { gap: 9 }]}><Avatar name={trip.travellerName} size={32} color={trip.origin === "Jos" ? "#EADFD0" : trip.origin === "Abuja" ? "#E6E5D2" : "#DCE9DD"} /><View><Txt style={{ fontSize: 11, fontWeight: "600" }}>{own ? "Your trip" : trip.travellerName}</Txt><View style={[s.row, { gap: 4, marginTop: 3 }]}><CheckCircle2 size={12} color={colors.muted} /><Txt style={{ fontSize: 9, color: colors.muted }}>Identity verified</Txt></View></View></View><Txt style={{ color: colors.muted, fontSize: 9 }}>{shortDate(trip.departureAt)}</Txt></View><RouteLine origin={trip.origin} destination={trip.destination} compact /><View style={[s.row, { gap: 7, marginTop: 14 }]}><Clock3 size={12} color={colors.muted} /><Txt style={{ fontSize: 10, color: colors.muted }}>{new Date(trip.departureAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Txt><Txt style={{ color: colors.border }}>·</Txt><Txt style={{ fontSize: 10, color: colors.muted }}>{tripAvailableCapacity(trip)} kg available</Txt></View><View style={{ height: 1, backgroundColor: colors.border, marginVertical: 17 }} /><View style={[s.row, { justifyContent: "space-between" }]}><View><Txt style={{ fontSize: 10, color: colors.muted }}>{trip.maxParcelWeightKg ?? trip.capacityKg} kg max per parcel</Txt></View><Button title={mode === "sender" ? own ? "Your route" : "Send this way" : "Publish mine"} icon={!own || mode !== "sender" ? <ArrowUpRight size={14} color={colors.text} /> : undefined} small variant="secondary" disabled={mode === "sender" && own} onPress={onPress} /></View></Card>; }
function ShipmentRow({ shipment, onPress }: { shipment: Shipment; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={`View ${shipment.reference}, ${shipment.origin} to ${shipment.destination}`} onPress={onPress} style={({ pressed }) => [x.shipmentRow, pressed && { opacity: 0.7 }]}><View style={x.parcelIcon}><View style={{ width: 17, height: 19, borderWidth: 1.5, borderColor: "#9AA887", borderRadius: 3, transform: [{ rotate: "-9deg" }] }}><View style={{ position: "absolute", top: 0, bottom: 0, left: 7, width: 2, backgroundColor: "#9AA887" }} /></View></View><View style={{ flex: 1, minWidth: 0 }}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap", gap: 6 }]}><Txt style={{ fontSize: 12, fontWeight: "600" }}>{shipment.origin} → {shipment.destination}</Txt><Status status={shipment.status} /></View><Txt numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 7 }}>{shipment.reference} · {shipment.description}</Txt></View><ArrowUpRight size={16} color={colors.muted} /></Pressable>; }
function TrustCard({ onPress }: { onPress: () => void }) { return <View style={x.trustCard}><View style={x.trustIcon}><ShieldCheck size={23} color={colors.forest} /></View><Txt style={{ fontFamily: serif, fontSize: 25, lineHeight: 30, marginTop: 14 }}>A little trust.\nA long way.</Txt><Txt style={{ color: "#6C7B61", fontSize: 11, lineHeight: 20, marginTop: 12 }}>Verified people, declared parcels, and a one-time code at every handover. Thoughtful delivery starts here.</Txt><Button variant="ghost" title="Our safety promise" icon={<ArrowUpRight size={15} color={colors.forest} />} small onPress={onPress} style={{ alignItems: "flex-start", paddingHorizontal: 0, marginTop: 14 }} /></View>; }

function Matches({ mode, openForm, onDetail }: { mode: Mode; openForm: (kind: "shipment" | "trip", trip?: Trip) => void; onDetail: (id: string) => void }) {
  const { snapshot } = usePassenger(); const viewer = snapshot?.viewer;
  const { results: availableTrips, status: availableTripsStatus, loadMore: loadMoreAvailableTrips } = usePaginatedQuery(api.marketplace.availableTripsPage, mode === "sender" ? {} : "skip", { initialNumItems: 30 });
  const { results: ownTrips, status: ownTripsStatus, loadMore: loadMoreOwnTrips } = usePaginatedQuery(api.marketplace.myTripsPage, mode === "traveller" ? {} : "skip", { initialNumItems: 30 });
  const { results: availableShipments, status: availableShipmentsStatus, loadMore: loadMoreAvailableShipments } = usePaginatedQuery(api.marketplace.availableShipmentsPage, mode === "traveller" ? {} : "skip", { initialNumItems: 30 });
  const myTrips = ownTrips.filter(t => t.departureAt > Date.now());
  const shipments = snapshot?.shipments ?? [];
  const parcels = mode === "sender"
    ? shipments.filter(item => viewer?.id && item.senderId === viewer.id && ["open", "pending_review"].includes(item.status))
    : availableShipments;
  return <><SectionTitle title={mode === "sender" ? "A companion for your parcel" : "Parcels that fit your plans"} subtitle={mode === "sender" ? "Route suggestions are not bookings. The traveller must accept your approved parcel before payment." : "Only accept approved parcels on your own trip. Both people must be verified, and the backend keeps the parcel fee fixed."} />{mode === "traveller" && <View style={{ marginBottom: 24 }}><View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}><Txt style={s.h3}>Upcoming trips</Txt><Button title="+ Publish a trip" small variant="secondary" onPress={() => openForm("trip")} /></View>{myTrips.length === 0 ? <Notice>Publish your route to see which parcels you can take along.</Notice> : <View style={{ gap: 10 }}>{myTrips.map(t => <Card key={t.id} style={{ padding: 17 }}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><Txt style={{ fontSize: 13, fontWeight: "600" }}>{t.origin} → {t.destination}</Txt><Badge label={t.verified ? "Ready for matching" : "Verification pending"} tone={t.verified ? "green" : "amber"} /></View><Txt style={[s.muted, { marginTop: 8 }]}>{timeDate(t.departureAt)} · {tripAvailableCapacity(t)} kg left</Txt></Card>)}</View>}</View>}
    {parcels.length === 0 ? <Empty title={mode === "sender" ? "Let's give your parcel a route." : "No open parcels right now."} detail={mode === "sender" ? "Create a shipment to discover compatible upcoming trips. Approved parcels become visible to travellers." : "New parcels appear after review. Keep your upcoming trips published and check back soon."} action={mode === "sender" ? "Send a package" : "Publish a trip"} onAction={() => openForm(mode === "sender" ? "shipment" : "trip")} /> : <View style={{ gap: 17 }}>{parcels.map(item => {
      const matching = findMatchingTrips(item, mode === "sender" ? availableTrips : myTrips);
      return <Card key={item.id}><View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><Txt style={s.h3}>{item.origin} → {item.destination}</Txt><Status status={item.status} /></View><Txt style={{ fontSize: 13, marginTop: 14 }}>{item.description}</Txt><Txt style={[s.muted, { marginTop: 6 }]}>{item.weightKg} kg · {item.category} · delivery fee {money(item.feeNaira)}</Txt><View style={s.divider} />{item.status === "pending_review" ? <Txt style={s.muted}>Your declared contents are awaiting review. Matching unlocks after approval.</Txt> : matching.length === 0 ? <Txt style={s.muted}>No matching trip with enough remaining capacity yet.</Txt> : <View style={{ gap: 10 }}>{matching.slice(0, 3).map(t => <View key={t.id} style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}><View style={[s.row, { gap: 8 }]}><Avatar name={t.travellerName} size={27} /><Txt style={{ fontSize: 11 }}>{mode === "traveller" ? "Your trip" : t.travellerName} · {timeDate(t.departureAt)}</Txt></View><Badge label={`${tripAvailableCapacity(t)} kg available`} /></View>)}</View>}<Button title={mode === "sender" ? "View parcel and next steps" : "Review parcel and accept"} icon={<ArrowUpRight size={15} color={colors.text} />} variant="secondary" onPress={() => onDetail(item.id)} style={{ marginTop: 17 }} /></Card>;
    })}</View>}
    {mode === "sender" && availableTripsStatus === "CanLoadMore" ? <Button title="Load more trip matches" variant="secondary" onPress={() => loadMoreAvailableTrips(30)} style={{ marginTop: 16 }} /> : null}
    {mode === "traveller" && ownTripsStatus === "CanLoadMore" ? <Button title="Load more of my trips" variant="secondary" onPress={() => loadMoreOwnTrips(30)} style={{ marginTop: 16 }} /> : null}
    {mode === "traveller" && availableShipmentsStatus === "CanLoadMore" ? <Button title="Load more parcels" variant="secondary" onPress={() => loadMoreAvailableShipments(30)} style={{ marginTop: 16 }} /> : null}
  </>;
}
function NameOnboarding() {
  const data = usePassenger();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = name.trim().length > 0 && name.trim().length <= 120;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await data.saveActivationName(name.trim());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return <SafeAreaView style={x.activationSafe}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={x.activationScreen}>
      <View style={x.activationContent}>
        <Txt accessibilityRole="header" style={x.activationTitle}>Add your name</Txt>
        <Field label="Full name" value={name} onChangeText={setName} editable={!busy} autoComplete="name" autoCapitalize="words" maxLength={120} returnKeyType="done" onSubmitEditing={() => void save()} />
        {error !== "" ? <Notice tone="error">{error}</Notice> : null}
        <Button title="Continue to routes" variant="lime" busy={busy} disabled={!valid || busy} onPress={() => void save()} />
        <Button title="Sign out" variant="ghost" disabled={busy} onPress={() => void data.signOut().catch(cause => setError(errorMessage(cause)))} />
      </View>
    </ScrollView>
  </SafeAreaView>;
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

  if (error !== "") return <FullScreenState
    title="Setup failed"
    subtitle={error}
    primaryAction={{ label: "Retry setup", onPress: () => void bootstrap() }}
    secondaryAction={{ label: "Sign out", onPress: () => void data.signOut().catch(e => setError(errorMessage(e))) }}
  />;

  return <AppLoadingScreen label="Setting up your profile…" />;
}
export function Centered({ title, detail, children }: React.PropsWithChildren<{ title: string; detail: string }>) { return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 28, paddingHorizontal: HORIZONTAL_PADDING }}><View style={{ maxWidth: 440, width: "100%", gap: 17 }}><Logo /><Txt style={{ fontFamily: serif, fontSize: 37, lineHeight: 44, marginTop: 20 }}>{title}</Txt><Txt style={[s.muted, { fontSize: 14, lineHeight: 23 }]}>{detail}</Txt>{children}</View></ScrollView></SafeAreaView>; }

const x = StyleSheet.create({
  activationSafe: { flex: 1, backgroundColor: colors.bg },
  activationScreen: { flexGrow: 1, justifyContent: "center", paddingHorizontal: HORIZONTAL_PADDING, paddingVertical: 32 },
  activationContent: { width: "100%", maxWidth: 520, alignSelf: "center", gap: 16 },
  activationTitle: { fontSize: 30, lineHeight: 36, fontFamily: "WorkSansSemiBold", color: colors.text, letterSpacing: -0.5 },
  safe: { flex: 1, backgroundColor: colors.bg },
  sidebar: { width: 220, backgroundColor: "#FCFCF7", borderRightWidth: 1, borderRightColor: colors.border, paddingTop: 33, paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 18 }, navItem: { flexDirection: "row", gap: 11, alignItems: "center", paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, minHeight: 46 }, sideTip: { backgroundColor: "#F0F2E7", borderRadius: 13, padding: 17, marginTop: 35 }, tipCircle: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#DFE8CB", justifyContent: "center", alignItems: "center" }, sidebarProfile: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 20, marginTop: 21, borderTopWidth: 1, borderTopColor: colors.border },
  topbar: { height: 75, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: HORIZONTAL_PADDING, backgroundColor: "#FAFAF5" }, topbarDivider: { height: 19, width: 1, backgroundColor: colors.border }, scroll: { paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 32, paddingBottom: 12 }, content: { width: "100%", maxWidth: 1200, alignSelf: "center" }, welcomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 27 }, welcome: { fontSize: 30, letterSpacing: -1, fontWeight: "500" }, modeSwitch: { flexDirection: "row", backgroundColor: "#ECEFE5", padding: 4, borderRadius: 11 }, modeButton: { paddingHorizontal: 13, paddingVertical: 11, borderRadius: 8 }, modeActive: { backgroundColor: colors.forest },
  hero: { backgroundColor: colors.forest, borderRadius: 19, flexDirection: "row", overflow: "hidden", minHeight: 295 }, heroHeadline: { fontFamily: serif, color: "#F6F7E9", letterSpacing: -1.5 }, heroCopy: { color: "#C0D1BD", fontSize: 12, lineHeight: 21, marginTop: 16, maxWidth: 350 }, artOrbit: { position: "absolute", height: 250, width: 185, borderWidth: 1, borderStyle: "dashed", borderColor: "#4B684B", borderRadius: 150, transform: [{ rotate: "-35deg" }] }, artCity: { position: "absolute", top: 38, left: 25, flexDirection: "row", alignItems: "center", gap: 7 }, parcel: { width: 133, height: 139, borderRadius: 5, backgroundColor: "#D8BD8C", transform: [{ rotate: "-12deg" }], borderBottomWidth: 12, borderBottomColor: "#BDA272", borderRightWidth: 8, borderRightColor: "#B59C71", overflow: "hidden" }, parcelTape: { position: "absolute", left: 47, top: 0, bottom: 0, width: 24, backgroundColor: "#E8D7B3" }, parcelLabel: { position: "absolute", top: 44, right: 15, width: 67, height: 74, backgroundColor: "#F7F5E6", borderRadius: 3, padding: 8, alignItems: "center", gap: 2 }, parcelShadow: { position: "absolute", width: 139, height: 30, borderRadius: 90, bottom: 69, backgroundColor: "#14352B", transform: [{ rotate: "-12deg" }] }, artStamp: { position: "absolute", backgroundColor: colors.lime, height: 43, width: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", right: 21, bottom: 74, borderWidth: 5, borderColor: colors.forest }, stats: { flexDirection: "row", gap: 12 },
  searchBox: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 19, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 17 }, searchLabel: { color: colors.muted, fontSize: 8, letterSpacing: 1.5, marginBottom: 2 }, swap: { borderWidth: 1, borderColor: colors.border, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, routeChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }, shipmentRow: { padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 }, parcelIcon: { width: 39, height: 43, backgroundColor: "#F2F3EB", borderRadius: 10, alignItems: "center", justifyContent: "center" }, trustCard: { backgroundColor: "#E9EFDB", borderRadius: 16, padding: 24 }, trustIcon: { height: 38, width: 38, borderRadius: 13, borderWidth: 1, borderColor: "#CFD9B9", justifyContent: "center", alignItems: "center" }, footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 15, marginTop: 47, paddingTop: 23, paddingBottom: 22, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: "wrap" },
  bottomNav: { flexDirection: "row", backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, paddingBottom: Platform.OS === "web" ? 10 : 5, paddingHorizontal: 8 },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 54, gap: 4 },
  bottomNavIcon: { width: 36, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  bottomNavIconActive: { backgroundColor: colors.soft },
  bottomNavIconInactive: { opacity: 0.62 },
  bottomNavLabel: { color: semantic.color.text.secondary, fontSize: 12, lineHeight: 17, fontFamily: "WorkSansRegular" },
  bottomNavLabelActive: { color: semantic.color.action.primary, fontFamily: "WorkSansMedium" },
  fab: {
    position: "absolute",
    bottom: 85,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: semantic.color.action.primary,
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
    backgroundColor: semantic.color.action.primary,
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
    color: semantic.color.action.primary,
    fontSize: 13,
    fontFamily: "WorkSansSemiBold",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "WorkSansSemiBold",
  },
});
