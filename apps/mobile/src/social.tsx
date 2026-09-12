import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Star } from "lucide-react-native";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import type { Message, Notification, Shipment } from "@passenger/core";
import { shipmentId, usePassengerState } from "./data";
import { Button, colors, ContentSkeleton, Empty, errorMessage, Field, Notice, OfflineBadge, s, SectionTitle, timeDate, Txt } from "./ui";

export function Inbox({ onDetail, showHeading = true }: { onDetail: (id: string) => void; showHeading?: boolean }) {
  const { offline } = usePassengerState();
  const { results: items, status, loadMore } = usePaginatedQuery(api.notifications.listPage, {}, { initialNumItems: 20 });
  const unreadCount = useQuery(api.notifications.unreadCount, {});
  const markRead = useMutation(api.notifications.markRead);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const read = useCallback(async (id?: string) => {
    if (offline || busy) return;
    setBusy(id || "all");
    setError("");
    try { await markRead(id ? { notificationId: id as Id<"notifications"> } : {}); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(""); }
  }, [markRead, offline, busy]);
  return <View style={{ gap: 14 }}>
    {showHeading && <SectionTitle title="Notifications" subtitle="Account, payment and delivery updates." />}
    {offline && <Notice tone="warning">You're offline. Reconnect to mark notifications as read.</Notice>}
    {error !== "" && <Notice tone="error">{error}</Notice>}
    {status === "LoadingFirstPage" ? <ContentSkeleton rows={3} /> : !items.length
      ? <Empty title="No notifications yet" detail="Your account and delivery updates will appear here." />
      : <>
        <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
          <Txt style={s.muted}>{unreadCount === undefined ? "Your updates" : unreadCount ? `${unreadCount} unread` : "You're all caught up"}</Txt>
          <Button title="Mark all as read" variant="ghost" small disabled={offline || !!busy || !unreadCount} busy={busy === "all"} onPress={() => void read()} />
        </View>
        {items.map(item => <NotificationRow key={item.id} item={item} busy={offline ? "offline" : busy} onDetail={onDetail} onRead={read} />)}
        {status !== "Exhausted" && <Button title={status === "LoadingMore" ? "Loading earlier notifications" : "Load earlier notifications"} variant="secondary" busy={status === "LoadingMore"} disabled={offline || status === "LoadingMore"} onPress={() => loadMore(20)} />}
      </>}
  </View>;
}
export function Conversation({ shipment }: { shipment: Shipment }) {
  const { snapshot, offline } = usePassengerState(); const viewer = snapshot?.viewer;
  const { results, status, loadMore } = usePaginatedQuery(api.conversations.listPage, { shipmentId: shipmentId(shipment.id) }, { initialNumItems: 30 });
  const messages = useMemo(() => [...results].reverse(), [results]);
  const send = useMutation(api.conversations.send);
  const [body, setBody] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { const pendingBody = body.trim(); if (!pendingBody) return; setBody(""); setBusy(true); setError(""); try { await send({ shipmentId: shipmentId(shipment.id), body: pendingBody }); } catch (e) { setBody(current => current || pendingBody); setError(errorMessage(e)); } finally { setBusy(false); } };
  return <View style={{ gap: 12 }}><SectionTitle title="Coordinate, with care." subtitle="Private to delivery participants and authorized operations. Never send handover or receipt codes here." />{offline && <OfflineBadge queued />}{status === "LoadingFirstPage" ? <ContentSkeleton rows={3} /> : !messages.length ? <Notice>No messages yet. Confirm your meeting arrangements here.</Notice> : <>{status !== "Exhausted" && <Button title={status === "LoadingMore" ? "Loading earlier messages" : "Load earlier messages"} variant="ghost" busy={status === "LoadingMore"} disabled={status === "LoadingMore"} onPress={() => loadMore(30)} />}{messages.map(message => <MessageRow key={message.id} message={message} viewerId={viewer?.id ?? ""} />)}</>}<Field label="Message" value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Let's meet by the main entrance…" editable={!busy} />{error !== "" && <Notice tone="error">{error}</Notice>}<Button title="Send message" onPress={() => void submit()} busy={busy} disabled={!body.trim()} /></View>;
}

const NotificationRow = memo(function NotificationRow({ item, busy, onDetail, onRead }: { item: Notification; busy: string; onDetail: (id: string) => void; onRead: (id?: string) => Promise<void> }) {
  return <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }}>
    <View style={[s.row, { alignItems: "flex-start" }]}>
      <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 7, backgroundColor: item.readAt ? "transparent" : colors.forest }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Txt style={[s.h3, { fontWeight: item.readAt ? "500" : "600" }]}>{item.title}</Txt>
        <Txt style={s.muted}>{item.body}</Txt>
        <View style={[s.row, { flexWrap: "wrap" }]}><Txt style={s.hint}>{timeDate(item.createdAt)}</Txt>{!item.readAt && <Txt style={s.hint}>Unread</Txt>}</View>
        <View style={s.wrap}>
          {item.shipmentId && <Button title="View delivery" small variant="ghost" onPress={() => { if (!item.readAt && !busy) void onRead(item.id); onDetail(item.shipmentId!); }} />}
          {!item.readAt && <Button title="Mark as read" small variant="ghost" disabled={!!busy} busy={busy === item.id} onPress={() => void onRead(item.id)} />}
        </View>
      </View>
    </View>
  </View>;
});

const MessageRow = memo(function MessageRow({ message, viewerId }: { message: Message; viewerId: string }) {
  const mine = message.authorId === viewerId;
  return <View style={{ borderRadius: 12, padding: 14, backgroundColor: mine ? colors.soft : "#F7F6F0", marginLeft: mine ? 20 : 0, marginRight: mine ? 0 : 20 }}><Txt style={{ fontSize: 11, fontWeight: "600" }}>{mine ? "You" : message.authorName}</Txt><Txt style={{ marginTop: 6, lineHeight: 21 }}>{message.body}</Txt><Txt style={[s.hint, { marginTop: 6 }]}>{timeDate(message.createdAt)}</Txt></View>;
});
export function DeliveryReview({ shipment }: { shipment: Shipment }) {
  return <RatingForm key={shipment.id} shipment={shipment} />;
}

function RatingForm({ shipment }: { shipment: Shipment }) {
  const { snapshot, offline } = usePassengerState();
  const viewer = snapshot?.viewer;
  const reviews = useQuery(api.reviews.list, {});
  const create = useMutation(api.reviews.create);
  const existing = reviews?.find(review => review.shipmentId === shipment.id && review.authorId === viewer?.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (!reviews) return <ContentSkeleton rows={2} />;
  if (existing || saved) return <Notice tone="success">Rating saved. You gave {existing?.rating ?? rating} out of 5 stars.{existing?.comment ? ` ${existing.comment}` : ""}</Notice>;
  const submit = async () => {
    if (busy || offline || !rating) return;
    setBusy(true);
    setError("");
    try {
      await create({ shipmentId: shipmentId(shipment.id), rating, comment: comment.trim() });
      setSaved(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return <View style={{ gap: 12 }}>
    <SectionTitle title={viewer?.id === shipment.senderId ? "Rate your traveller" : "Rate your sender"} subtitle="How was your delivery?" />
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map(value => <Pressable
        key={value}
        accessibilityRole="radio"
        accessibilityLabel={`${value} out of 5 stars`}
        accessibilityState={{ selected: rating === value, disabled: busy }}
        disabled={busy}
        onPress={() => setRating(value)}
        style={({ pressed }) => ({ width: 44, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: pressed ? colors.soft : "transparent", opacity: busy ? 0.5 : 1 })}
      ><Star size={32} color={value <= rating ? colors.forest : colors.border} fill={value <= rating ? colors.forest : "none"} /></Pressable>)}
    </View>
    <Txt style={s.hint}>{rating ? ["", "Poor", "Fair", "Good", "Very good", "Excellent"][rating] : "Tap a star to rate"}</Txt>
    <Field label="Comment (optional)" multiline value={comment} onChangeText={setComment} maxLength={1000} editable={!busy} placeholder="Anything you'd like to share?" />
    {offline && <Notice>Connect to the internet to save your rating.</Notice>}
    {error !== "" && <Notice tone="error">{error}</Notice>}
    <Button title="Save rating" busy={busy} disabled={busy || offline || !rating} onPress={() => void submit()} />
  </View>;
}
