import React, { useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight, Headset, MessageCircle, X } from "lucide-react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { EvidencePicker } from "./evidence";
import { usePassengerState } from "./data";
import { BrandIllustration, type IllustrationName } from "./illustrations";
import { BackButton, Badge, Button, Card, colors, ContentSkeleton, Empty, errorMessage, Field, Notice, s, timeDate, Txt } from "./ui";

const guides: { title: string; subtitle: string; art: IllustrationName; sections: { title: string; body: string }[] }[] = [
  { title: "Parcels & delivery", subtitle: "Packing, tracking and handovers", art: "createParcel", sections: [
    { title: "Declare and pack your parcel", body: "List every item, its weight and value. Weapons, illegal drugs, cash, hazardous materials, stolen goods and live animals are prohibited. Your parcel is reviewed before matching." },
    { title: "Meet and hand over safely", body: "Meet in a public place and inspect the contents together. Share the handover code only when the assigned traveller is taking the parcel. Send the separate delivery code privately to the receiver, who shares it after receiving and inspecting the parcel." },
    { title: "Follow delivery updates", body: "Open your delivery to see confirmed milestones and timestamps. Use its conversation to agree on meeting arrangements. Tracking does not show live GPS." },
  ] },
  { title: "Payments & problems", subtitle: "Payment protection and disputes", art: "milestonesClear", sections: [
    { title: "Check payment in the app", body: "Pay through Passenger after matching. Travellers should wait for confirmed payment before collection. A screenshot or off-platform transfer is not confirmation." },
    { title: "Report a delivery problem", body: "Open the delivery and raise a dispute with a clear description. Support reviews the milestones and payouts stay on hold while the dispute is unresolved. A support message alone does not open a dispute." },
    { title: "Keep private details private", body: "Never send payment credentials or handover codes to support. Declared parcel value is not insurance or a compensation promise." },
  ] },
  { title: "Account & safety", subtitle: "Verification and safe travel", art: "phoneVerification", sections: [
    { title: "Verify your account", body: "Open your profile to check your verification status and provide the requested details. A verified badge confirms a completed review, not a guarantee against loss or misconduct." },
    { title: "Travel with clear expectations", body: "Passenger connects senders with people already travelling. It is a parcel marketplace, not a passenger transport service. Refuse any parcel whose contents do not match its declaration." },
    { title: "If you feel unsafe", body: "Move to a safe place and contact local emergency services if there is immediate danger. You can then report the incident to Passenger through a support request." },
  ] },
];

export type SupportRequestContext = { kind: "delivery" | "trip"; id: string; category?: string };

export function SupportHub({ onClose, onOpenDelivery, initialContext }: { onClose: () => void; onOpenDelivery: (id: string) => void; initialContext?: SupportRequestContext }) {
  const { snapshot, offline } = usePassengerState();
  const chats = useQuery(api.support.myChats, {});
  const [page, setPage] = useState<"home" | "request" | "history" | "guide">(initialContext ? "request" : "home");
  const [guide, setGuide] = useState(0);
  const [chatId, setChatId] = useState<Id<"supportChats"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const mine = snapshot?.shipments.filter(item => item.senderId === snapshot.viewer?.id || item.travellerId === snapshot.viewer?.id) ?? [];
  const back = () => { setChatId(null); setPage("home"); setError(""); setSent(false); };
  const active = chats?.find(chat => chat.id === chatId);
  const title = chatId ? "Your conversation" : page === "request" ? "Contact support" : page === "history" ? "Your requests" : page === "guide" ? guides[guide].title : "How can we help?";
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) (page !== "home" || chatId ? back : onClose)(); }}>
    <SafeAreaView style={h.screen}>
      <KeyboardAvoidingView style={h.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={h.header}>
          <BackButton disabled={busy} onPress={page !== "home" || chatId ? back : onClose} />
          <Txt accessibilityRole="header" style={[s.h3, h.headerTitle]}>{title}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Close support" disabled={busy} onPress={onClose} style={s.close}><X size={20} color={colors.muted} /></Pressable>
        </View>
        <ScrollView key={chatId ?? page} keyboardShouldPersistTaps="handled" contentContainerStyle={h.content}>
    <View style={h.stack}>
      {offline && <Notice tone="warning">You're offline. Reconnect to send a message or load the latest replies.</Notice>}
      {chatId ? <>
        {sent && <Notice tone="success">Request sent. Replies will appear in this conversation.</Notice>}
        {active && <View style={s.row}><Txt style={[s.h3, { flex: 1 }]}>{active.subject}</Txt><Badge label={active.status === "unresolved" ? "Open" : active.status === "resolved" ? "Resolved" : "Closed"} /></View>}
        <RequestContext chatId={chatId} onOpenDelivery={onOpenDelivery} />
        <SupportConversation chatId={chatId} closed={active?.status !== "unresolved"} />
      </> : page === "home" ? <>
        <Card style={h.contact}><Headset size={28} color={colors.forest} /><Txt style={s.h3}>Talk to the Passenger team</Txt><Txt style={s.muted}>Tell us what happened. Keep your request and replies together here.</Txt><Button title="Contact support" onPress={() => setPage("request")} /></Card>
        <Pressable accessibilityRole="button" style={h.row} onPress={() => setPage("history")}><MessageCircle size={22} color={colors.forest} /><View style={h.grow}><Txt style={s.h3}>Your requests</Txt><Txt style={s.hint}>{chats ? `${chats.filter(c => c.status === "unresolved").length} open requests` : "Check replies and past conversations"}</Txt></View><ChevronRight size={18} color={colors.muted} /></Pressable>
        <Txt style={s.h3}>Help guides</Txt>
        {guides.map((item, index) => <Pressable key={item.title} accessibilityRole="button" style={h.row} onPress={() => { setGuide(index); setPage("guide"); }}><BrandIllustration name={item.art} size={72} /><View style={h.grow}><Txt style={s.h3}>{item.title}</Txt><Txt style={s.muted}>{item.subtitle}</Txt></View><ChevronRight size={18} color={colors.muted} /></Pressable>)}
      </> : page === "guide" ? <>
        <View style={h.guideHero}><BrandIllustration name={guides[guide].art} size={150} /><Txt style={s.muted}>{guides[guide].subtitle}</Txt></View>
        {guides[guide].sections.map(section => <View key={section.title} style={h.stack}><Txt style={s.h3}>{section.title}</Txt><Txt style={s.muted}>{section.body}</Txt></View>)}
        {guide === 1 && mine.map(item => <Button key={item.id} title={`Open delivery: ${item.origin} to ${item.destination}`} variant="secondary" onPress={() => onOpenDelivery(item.id)} />)}
        <Button title="Still need help? Contact support" variant="secondary" onPress={() => { setPage("request"); }} />
      </> : page === "history" ? <>
        {!chats ? <ContentSkeleton rows={3} /> : !chats.length ? <Empty illustration="milestonesClear" title="No requests yet" detail="Need a hand? Start a request and keep your replies from the Passenger team together here." action="Contact support" onAction={() => setPage("request")} /> : chats.map(chat => <Pressable key={chat.id} accessibilityRole="button" style={h.row} onPress={() => setChatId(chat.id)}><View style={h.grow}><Txt style={s.h3}>{chat.subject || "Support request"}</Txt><Txt style={s.hint}>{timeDate(chat.lastMessageAt)}</Txt></View><Badge label={chat.status === "unresolved" ? "Open" : chat.status === "resolved" ? "Resolved" : "Closed"} /><ChevronRight size={16} color={colors.muted} /></Pressable>)}
        {!!chats?.length && <Button title="New request" onPress={() => setPage("request")} />}
      </> : <SupportRequestForm initialContext={initialContext} onOpenDelivery={onOpenDelivery} onBusyChange={setBusy} onCreated={id => { setChatId(id); setSent(true); }} />}

    </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

function SupportRequestForm({ onCreated, onBusyChange, initialContext, onOpenDelivery }: { initialContext?: SupportRequestContext; onOpenDelivery: (id: string) => void; onCreated: (id: Id<"supportChats">) => void; onBusyChange: (busy: boolean) => void }) {
  const { snapshot, offline } = usePassengerState();
  const records = useQuery(api.support.contextOptions, {});
  const create = useMutation(api.support.createChat);
  const [kind, setKind] = useState<"delivery" | "trip" | "other" | null>(initialContext?.kind ?? null);
  const [selected, setSelected] = useState(initialContext?.id ?? "");
  const [category, setCategory] = useState(initialContext?.category ?? "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [period, setPeriod] = useState<"ongoing" | "past">("ongoing");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  React.useEffect(() => { onBusyChange(busy || uploading); }, [busy, uploading, onBusyChange]);
  const options = kind === "delivery" ? records?.deliveries : records?.trips;
  const record = options?.find(item => item.id === selected);
  const ready = kind === "other" || !!record;
  const otherPeriod = period === "past" ? "ongoing" : "past";
  const hasOtherPeriod = options?.some(item => item.past === (otherPeriod === "past"));
  return <View style={h.stack}>
    {!kind ? <>
      <Txt style={s.h3}>What is your issue about?</Txt>
      <Txt style={s.muted}>Choose what you need help with so we can find the right details.</Txt>
      <View style={h.issueCards}>
        {([['delivery', 'A delivery', 'A parcel you are sending or carrying', 'createParcel'], ['trip', 'A trip', 'A journey you have published', 'createTrip']] as const).map(([value, label, hint, art]) => <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityLabel={`${label}. ${hint}`}
          style={({ pressed }) => [h.issueCard, pressed && h.issueCardPressed]}
          onPress={() => { setKind(value); setSelected(""); setError(""); }}
        >
          <BrandIllustration name={art} size={104} style={h.issueArt} />
          <Txt style={s.h3}>{label}</Txt>
          <Txt style={[s.muted, h.issueHint]}>{hint}</Txt>
        </Pressable>)}
      </View>
      <Pressable accessibilityRole="button" style={h.row} onPress={() => { setKind("other"); setSelected(""); setError(""); }}><View style={h.grow}><Txt style={s.h3}>Other issue</Txt><Txt style={s.muted}>Your account, payments or something else</Txt></View><ChevronRight size={20} color={colors.text} /></Pressable>
    </> : !ready ? <>
      <Button title="Change issue type" small variant="ghost" onPress={() => { setKind(null); setSelected(""); }} />
      <Txt style={s.h3}>{kind === "delivery" ? "Which delivery?" : "Which trip?"}</Txt>
      <View style={s.wrap}><Button title="Ongoing" small variant={period === "ongoing" ? "primary" : "secondary"} onPress={() => setPeriod("ongoing")} /><Button title="Past" small variant={period === "past" ? "primary" : "secondary"} onPress={() => setPeriod("past")} /></View>
      {!records ? <ContentSkeleton rows={3} /> : !options?.some(item => item.past === (period === "past")) ? <Empty
        illustration={kind === "delivery" ? "createParcel" : "routesEmpty"}
        title={`No ${period} ${kind === "delivery" ? "deliveries" : "trips"}`}
        detail={hasOtherPeriod ? `Your ${otherPeriod} ${kind === "delivery" ? "deliveries" : "trips"} are in the other tab. Choose one to get help with it.` : "Can't find what you need? Choose Other issue to tell the team what happened."}
        action={hasOtherPeriod ? `View ${otherPeriod} ${kind === "delivery" ? "deliveries" : "trips"}` : "Other issue"}
        onAction={() => { if (hasOtherPeriod) setPeriod(otherPeriod); else { setKind("other"); setSelected(""); setError(""); } }}
      /> : options.filter(item => item.past === (period === "past")).map(item => <Pressable key={item.id} accessibilityRole="button" style={h.row} onPress={() => setSelected(item.id)}><View style={h.grow}><Txt style={s.h3}>{item.origin} to {item.destination}</Txt><Txt style={s.hint}>{item.reference} · {timeDate(item.date)}</Txt><Txt style={s.hint}>{item.status.replaceAll("_", " ")}</Txt></View><ChevronRight size={18} color={colors.muted} /></Pressable>)}
    </> : <>
      <Card><Txt style={s.h3}>{kind === "other" ? "Other issue" : record ? `${record.origin} to ${record.destination}` : "Selected record"}</Txt>{record && <Txt style={s.hint}>{record.reference} · {timeDate(record.date)}</Txt>}<Button title="Change selection" small variant="ghost" disabled={busy || uploading} onPress={() => { setKind(null); setSelected(""); }} /></Card>
      <Txt style={s.label}>Issue type</Txt>
      <View style={s.wrap}>{["Delay", "Can't reach the other person", "Lost or damaged parcel", "Payment", "Safety incident", "Other"].map(value => <Button key={value} title={value} small variant={category === value ? "primary" : "secondary"} disabled={busy || uploading} onPress={() => setCategory(value)} />)}</View>
      {kind === "delivery" && ["Lost or damaged parcel", "Payment"].includes(category) && <View style={h.stack}><Notice tone="warning">For a delivery or payment dispute, open the delivery and choose “Something wrong? Raise a dispute”. Sending a support request does not open a dispute or pause payment.</Notice><Button title="Open delivery for dispute" variant="secondary" disabled={busy || uploading} onPress={() => onOpenDelivery(selected)} /></View>}
      <Field label="What happened?" placeholder="Tell us what went wrong and how we can help." value={body} onChangeText={setBody} multiline maxLength={2000} editable={!busy} />
      <Txt style={s.label}>Photos, optional</Txt>
      <EvidencePicker purpose="parcel" compact value={photos} onChange={setPhotos} disabled={busy} onBusyChange={setUploading} />
      <Txt style={s.hint}>Don't include passwords, payment details or private delivery codes.</Txt>
      {!!error && <Notice tone="error">{error}</Notice>}
      <Button title="Send request" busy={busy} disabled={offline || uploading || !category || !body.trim() || !snapshot?.viewer} onPress={async () => {
        if (busy || uploading || !category || !snapshot?.viewer || !kind || !ready) return;
        setBusy(true); onBusyChange(true); setError("");
        try {
          const id = await create({ userId: snapshot.viewer.id as Id<"users">, contextKind: kind, shipmentId: kind === "delivery" ? selected as Id<"shipments"> : undefined, tripId: kind === "trip" ? selected as Id<"trips"> : undefined, subject: `${category}: ${record ? `${record.origin} to ${record.destination}` : "Other issue"}`.slice(0, 160), body: body.trim(), evidenceIds: photos as Id<"evidence">[] });
          onCreated(id);
        } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); onBusyChange(false); }
      }} />
    </>}
  </View>;
}

function RequestContext({ chatId, onOpenDelivery }: { chatId: Id<"supportChats">; onOpenDelivery: (id: string) => void }) {
  const request = useQuery(api.support.requestDetails, { chatId });
  if (!request) return <ContentSkeleton rows={1} />;
  return <Card>
    <Txt style={s.h3}>{request.contextKind === "other" ? "Other issue" : request.contextKind === "delivery" ? "Related delivery" : "Related trip"}</Txt>
    {request.context ? <><Txt>{request.context.origin} to {request.context.destination}</Txt><Txt style={s.hint}>{request.context.reference} · {request.context.status.replaceAll("_", " ")}</Txt><Txt style={s.hint}>{timeDate(request.context.date)}</Txt>{request.context.kind === "delivery" && <Button title="Open delivery" small variant="ghost" onPress={() => onOpenDelivery(request.context!.id)} />}</> : request.contextKind !== "other" && <Txt style={s.muted}>This record is no longer available. Support still has your request.</Txt>}
    {request.status !== "unresolved" && request.resolutionNote && <Notice>{request.resolutionNote}</Notice>}
  </Card>;
}

function SupportConversation({ chatId, closed }: { chatId: Id<"supportChats">; closed: boolean }) {
  const { snapshot, offline } = usePassengerState();
  const messages = useQuery(api.support.getMessages, { chatId });
  const send = useMutation(api.support.sendMessage);
  const [body, setBody] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <View style={h.stack}>
    {!messages ? <ContentSkeleton rows={3} /> : !messages.length ? <Empty illustration="milestonesClear" title="No messages yet" detail="Send a message below to start the conversation with the Passenger team." /> : messages.map(message => <View key={message.id} style={[h.message, message.authorId === snapshot?.viewer?.id ? h.ownMessage : undefined]}><Txt style={s.hint}>{message.authorId === snapshot?.viewer?.id ? "You" : "Passenger support"}</Txt><Txt style={{ lineHeight: 22 }}>{message.body}</Txt>{message.attachments.map(file => file.url ? <Button key={file.id} title={`View photo: ${file.filename}`} small variant="secondary" onPress={() => void Linking.openURL(file.url!).catch(cause => setError(errorMessage(cause)))} /> : <Txt key={file.id} style={s.hint}>Photo unavailable</Txt>)}<Txt style={s.hint}>{timeDate(message.createdAt)}</Txt></View>)}
    {closed && <Notice>Need more help with this issue? Sending a reply reopens the request.</Notice>}
    <Field label="Your reply" value={body} onChangeText={setBody} multiline maxLength={2000} editable={!busy} placeholder="Add a message for the team" />
    {error !== "" && <Notice tone="error">{error}</Notice>}
    <Button title="Send reply" disabled={offline || !body.trim()} busy={busy} onPress={async () => { if (busy) return; setBusy(true); setError(""); try { await send({ chatId, body: body.trim() }); setBody(""); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }} />
  </View>;
}

const h = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { flex: 1 },
  content: { padding: 24, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
  stack: { gap: 16 }, grow: { flex: 1, gap: 5 },
  contact: { gap: 12, backgroundColor: colors.soft },
  issueCards: { flexDirection: "row", gap: 12 },
  issueCard: { flex: 1, minWidth: 0, gap: 8, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  issueCardPressed: { backgroundColor: colors.soft, opacity: 0.85 },
  issueArt: { alignSelf: "center", maxWidth: "100%", marginBottom: 4 },
  issueHint: { flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 64 },
  guideHero: { alignItems: "center", gap: 12, padding: 20, backgroundColor: colors.soft, borderRadius: 20 },
  message: { gap: 8, padding: 16, borderRadius: 16, backgroundColor: colors.paper, marginRight: 24 },
  ownMessage: { backgroundColor: colors.soft, marginRight: 0, marginLeft: 24 },
});
