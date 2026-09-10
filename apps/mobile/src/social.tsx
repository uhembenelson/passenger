import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import type { Shipment } from "@passenger/core";
import { shipmentId, usePassenger } from "./data";
import { Badge, Button, Card, colors, Empty, errorMessage, Field, Notice, s, SectionTitle, timeDate, Txt } from "./ui";

export function Inbox({ onDetail }: { onDetail: (id: string) => void }) {
  const { snapshot, offline } = usePassenger(); const items = snapshot?.notifications;
  const markRead = useMutation(api.notifications.markRead);
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const read = async (id?: string) => { setBusy(id || "all"); setError(""); try { await markRead(id ? { notificationId: id as Id<"notifications"> } : {}); } catch (e) { setError(errorMessage(e)); } finally { setBusy(""); } };
  return <View style={{ gap: 14 }}><SectionTitle title="Your Passenger inbox" subtitle="Account reviews, offers, payments and delivery updates from the shared service." />{error !== "" && <Notice tone="error">{error}</Notice>}{items === undefined ? <ActivityIndicator color={colors.forest} /> : !items.length ? <Empty title="All quiet for now." detail="Your next account or delivery update will appear here." /> : <><Button title="Mark all as read" variant="secondary" disabled={offline || !!busy || items.every(n => !!n.readAt)} busy={busy === "all"} onPress={() => void read()} />{items.map(item => <Card key={item.id}><View style={[s.row, { justifyContent: "space-between" }]}><Txt style={s.h3}>{item.title}</Txt>{!item.readAt && <Badge label="New" />}</View><Txt style={[s.muted, { marginTop: 10 }]}>{item.body}</Txt><Txt style={[s.hint, { marginTop: 8 }]}>{timeDate(item.createdAt)}</Txt><View style={[s.wrap, { marginTop: 14 }]}>{item.shipmentId && <Button title="Open delivery ↗" small variant="secondary" onPress={() => onDetail(item.shipmentId!)} />}{!item.readAt && <Button title="Mark read" small variant="ghost" disabled={offline || !!busy} busy={busy === item.id} onPress={() => void read(item.id)} />}</View></Card>)}</>}</View>;
}
export function Conversation({ shipment }: { shipment: Shipment }) {
  const { snapshot, offline } = usePassenger(); const viewer = snapshot!.viewer!;
  const messages = useQuery(api.conversations.list, { shipmentId: shipmentId(shipment.id) });
  const send = useMutation(api.conversations.send);
  const [body, setBody] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setError(""); try { await send({ shipmentId: shipmentId(shipment.id), body: body.trim() }); setBody(""); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <View style={{ gap: 12 }}><SectionTitle title="Coordinate, with care." subtitle="Private to delivery participants and authorized operations. Never send handover or receipt codes here." />{messages === undefined ? <ActivityIndicator color={colors.forest} /> : !messages.length ? <Notice>No messages yet. Confirm your meeting arrangements here.</Notice> : messages.map(message => <View key={message.id} style={{ borderRadius: 12, padding: 14, backgroundColor: message.authorId === viewer.id ? colors.soft : "#F7F6F0", marginLeft: message.authorId === viewer.id ? 20 : 0, marginRight: message.authorId === viewer.id ? 0 : 20 }}><Txt style={{ fontSize: 11, fontWeight: "600" }}>{message.authorId === viewer.id ? "You" : message.authorName}</Txt><Txt style={{ marginTop: 6, lineHeight: 21 }}>{message.body}</Txt><Txt style={[s.hint, { marginTop: 6 }]}>{timeDate(message.createdAt)}</Txt></View>)}<Field label="Message" value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Let's meet by the main entrance…" editable={!busy} />{error !== "" && <Notice tone="error">{error}</Notice>}<Button title="Send message" onPress={() => void submit()} busy={busy} disabled={offline || !body.trim()} /></View>;
}
export function DeliveryReview({ shipment }: { shipment: Shipment }) {
  const { snapshot, offline } = usePassenger(); const viewer = snapshot!.viewer!;
  const reviews = useQuery(api.reviews.list, {}); const create = useMutation(api.reviews.create);
  const existing = reviews?.find(r => r.shipmentId === shipment.id && r.authorId === viewer.id);
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!reviews) return <ActivityIndicator color={colors.forest} />;
  if (existing) return <Notice tone="success">Your review is recorded: {existing.rating}/5. {existing.comment} Reviews can be submitted once per delivery.</Notice>;
  return <View style={{ gap: 12 }}><SectionTitle title="How was the journey?" subtitle="Review your delivery partner after confirmed receipt. One honest review per participant, per parcel." /><View style={s.wrap}>{[1, 2, 3, 4, 5].map(n => <Button key={n} title={`${n} ★`} small variant={rating === n ? "primary" : "secondary"} onPress={() => setRating(n)} disabled={busy} />)}</View><Field label="Your review" multiline value={comment} onChangeText={setComment} maxLength={1000} editable={!busy} placeholder="Share what went well or could improve…" />{error !== "" && <Notice tone="error">{error}</Notice>}<Button title="Publish review" busy={busy} disabled={offline || comment.trim().length < 5} onPress={async () => { setBusy(true); setError(""); try { await create({ shipmentId: shipmentId(shipment.id), rating, comment: comment.trim() }); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }} /></View>;
}
