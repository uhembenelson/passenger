import React, { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { Check, Clock3, ExternalLink } from "lucide-react-native";
import { usePaginatedQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { findMatchingTrips, money, shipmentActions, STATUS_LABELS } from "@passenger/core";
import type { Offer, Shipment } from "@passenger/core";
import { usePassenger } from "./data";
import { receiverCodeMessage, receiverCodeSmsUrl, receiverCodeWhatsAppUrl } from "./receiver-code-share";
import { ReceiverCodeSheet } from "./receiver-code-sheet";
import { HandoverFlow, type HandoverMode } from "./handover-flow";
import { EvidenceGallery } from "./evidence";
import { Conversation, DeliveryReview } from "./social";
import { BackButton, Badge, Button, Card, colors, errorMessage, Field, Notice, RouteLine, s, Sheet, Status, timeDate, Txt } from "./ui";

function tripAvailableCapacity(trip: { capacityKg: number; legReservedKg?: number[]; reservedKg?: number }) {
  const reserved = trip.legReservedKg?.length ? Math.max(...trip.legReservedKg) : trip.reservedKg ?? 0;
  return Math.max(0, trip.capacityKg - reserved);
}

export function DeliveryDetail({ shipment, onClose, onEdit }: { shipment: Shipment; onClose: () => void; onEdit?: () => void }) {
  const data = usePassenger();
  const snapshot = data.snapshot;
  const viewer = snapshot?.viewer ?? null;
  const actionViewer = viewer ?? null;
  const sender = viewer?.id ? shipment.senderId === viewer.id : false;
  const traveller = viewer?.id ? shipment.travellerId === viewer.id : false;
  const participant = sender || traveller;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [handoverMode, setHandoverMode] = useState<HandoverMode>();
  const [reason, setReason] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offerExpires, setOfferExpires] = useState("24");
  const [disputing, setDisputing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [receiverSheetOpen, setReceiverSheetOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<"" | "sms" | "whatsapp">("");
  const [shareError, setShareError] = useState("");
  const [shareDraft, setShareDraft] = useState<{ code: string; receiverPhone: string; reference: string } | null>(null);
  const { results: ownTrips, status: ownTripsStatus, loadMore: loadMoreOwnTrips } = usePaginatedQuery(api.marketplace.myTripsPage, !sender && !traveller && shipment.status === "open" ? {} : "skip", { initialNumItems: 30 });
  const { results: publicTrips, status: publicTripsStatus, loadMore: loadMorePublicTrips } = usePaginatedQuery(api.marketplace.availableTripsPage, sender && shipment.status === "open" ? {} : "skip", { initialNumItems: 30 });

  const act = async (key: string, fn: () => Promise<void>, message?: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      if (message) setNotice(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };

  const matching = useMemo(() => findMatchingTrips(shipment, ownTrips), [shipment, ownTrips]);
  const offers = (snapshot?.offers ?? []).filter((offer): offer is Offer => offer.shipmentId === shipment.id);
  const myOffers = offers.filter(offer => viewer?.id && offer.travellerId === viewer.id).sort((a, b) => b.createdAt - a.createdAt);
  const senderOffers = offers.filter(offer => offer.status === "pending").sort((a, b) => a.expiresAt - b.expiresAt);
  const compatibleTravellerTrips = useMemo(() => {
    return findMatchingTrips(shipment, publicTrips);
  }, [shipment, publicTrips]);
  const selectedOffer = useMemo(() => offers.find(offer => offer.status === "accepted"), [offers]);
  const events = (snapshot?.events ?? []).filter(e => e.shipmentId === shipment.id).sort((a, b) => b.createdAt - a.createdAt);
  const steps = ["Review", "Matched", "Payment", "Handover", "Delivered"];
  const step: number = ({ pending_review: 0, rejected: -1, open: 0, matched: 1, funded: 2, in_transit: 3, delivered: 4, disputed: -1, cancelled: -1 } satisfies Record<Shipment["status"], number>)[shipment.status];

  const shareReceiverCode = async (channel: "sms" | "whatsapp") => {
    if (shareBusy) return;
    setShareBusy(channel);
    setShareError("");
    try {
      let draft = shareDraft;
      if (!draft) {
        draft = await data.prepareDeliveryShare(shipment.id);
        setShareDraft(draft);
      }
      const message = receiverCodeMessage(draft.reference, draft.code);
      const url = channel === "sms" ? receiverCodeSmsUrl(draft.receiverPhone, message) : receiverCodeWhatsAppUrl(draft.receiverPhone, message);
      try {
        await Linking.openURL(url);
      } catch {
        throw new Error(channel === "whatsapp" ? "Unable to open WhatsApp on this device." : "Unable to open your messaging app on this device.");
      }
    } catch (e) {
      setShareError(errorMessage(e));
    } finally {
      setShareBusy("");
    }
  };

  if (handoverMode) return <HandoverFlow shipment={shipment} mode={handoverMode} onClose={() => setHandoverMode(undefined)} />;

  return <>
    <Sheet title={`${shipment.origin} to ${shipment.destination}`} onClose={() => !busy && onClose()} wide>
      <Txt selectable style={s.muted}>Reference: {shipment.reference}</Txt>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 20 }]}>
        <Status status={shipment.status} />
        <Txt style={s.muted}>{timeDate(shipment.createdAt)}</Txt>
      </View>

      <Card style={{ backgroundColor: "#F8FAF4" }}>
        <RouteLine origin={shipment.origin} destination={shipment.destination} />
        <Txt style={{ fontSize: 17, fontWeight: "600", marginTop: 18 }}>{shipment.description}</Txt>
        <Txt style={[s.muted, { marginTop: 7 }]}>
          {shipment.category} · {shipment.weightKg} kg{participant ? ` · declared value ${money(shipment.valueNaira)}` : " · receiver details shared after matching"}
        </Txt>
        <View style={[s.row, { justifyContent: "space-between", marginTop: 20 }]}>
          <Txt style={s.muted}>Delivery fee</Txt>
          <Txt style={{ fontSize: 24, fontWeight: "600" }}>{money(shipment.feeNaira)}</Txt>
        </View>
      </Card>

      <View style={{ marginTop: 24 }}>
        <Txt style={s.detailLabel}>Milestone updates, not live GPS</Txt>
        {step >= 0 ? <View style={{ flexDirection: "row", marginTop: 5, marginBottom: 20 }}>
          {steps.map((label, index) => <View key={label} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: "100%", alignItems: "center", justifyContent: "center", height: 25 }}>
              {index < steps.length - 1 && <View style={{ position: "absolute", left: "50%", right: "-50%", height: 2, backgroundColor: index < step ? colors.forest : colors.border }} />}
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: index <= step ? colors.forest : colors.soft, alignItems: "center", justifyContent: "center", borderWidth: index === step ? 3 : 0, borderColor: colors.lime }}>
                {index < step ? <Check size={12} color="white" strokeWidth={3} /> : <Clock3 size={11} color={index <= step ? "white" : colors.muted} strokeWidth={2.5} />}
              </View>
            </View>
            <Txt style={{ fontSize: 9, marginTop: 8, color: index <= step ? colors.forest : colors.muted }}>{label}</Txt>
          </View>)}
        </View> : <Notice tone={shipment.status === "cancelled" ? "neutral" : "warning"}>
          {shipment.status === "disputed"
            ? "Delivery is paused while operations reviews the dispute. No automatic payout is made."
            : shipment.status === "rejected"
              ? "Operations requested changes before this parcel can be published."
              : shipment.paymentStatus === "refunded"
                ? `This parcel was cancelled. Held delivery fee has been refunded to your wallet.${shipment.cancellationReason ? ` Reason: ${shipment.cancellationReason}` : ""}`
                : `This parcel was cancelled. It is no longer available for matching.${shipment.cancellationReason ? ` Reason: ${shipment.cancellationReason}` : ""}`}
        </Notice>}
      </View>

      {participant && <>
        <View style={s.divider} />
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <View style={{ flex: 1 }}>
            <Txt style={s.detailLabel}>Sender</Txt>
            <Txt style={s.h3}>{shipment.senderName}</Txt>
            <Txt style={[s.detailLabel, { marginTop: 20 }]}>Traveller</Txt>
            <Txt>{shipment.travellerName || "Not yet matched"}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={s.detailLabel}>Receiver</Txt>
            <Txt style={s.h3}>{shipment.receiverName}</Txt>
            <Txt style={[s.muted, { marginTop: 5 }]}>{shipment.receiverPhone}</Txt>
            <Txt style={[s.detailLabel, { marginTop: 20 }]}>Payment</Txt>
            <Badge label={shipment.paymentStatus === "held" ? "Paid · payout held" : shipment.paymentStatus === "released" ? "Payout released" : shipment.paymentStatus === "refunded" ? "Refunded" : "Not paid"} tone={shipment.paymentStatus === "unpaid" ? "amber" : "green"} />
          </View>
        </View>
      </>}

      <View style={s.divider} />

      {sender && shipment.status === "pending_review" && <Notice tone="warning">Your declared contents are being reviewed. Operations will approve eligible parcels; you do not need to pay yet.</Notice>}

      {sender && shipment.status === "rejected" && <View style={{ gap: 12 }}>
        <Notice tone="warning">{shipment.reviewNote ? `Review feedback: ${shipment.reviewNote}` : "Operations requested changes to this parcel. Correct the declaration and evidence, then resubmit it for review."}</Notice>
        {onEdit && <Button title="Fix & resubmit parcel" onPress={onEdit} />}
      </View>}

      {sender && shipment.status === "open" && <View style={{ gap: 12 }}>
        <Notice>Your parcel is approved and visible to eligible travellers. Verified travellers can now send offers from their own compatible trips. Review the route, timing, and note before choosing one. No payment is needed until you accept an offer.</Notice>
        {senderOffers.length > 0 ? senderOffers.map(offer => <Card key={offer.id} style={{ padding: 17 }}>
          <Txt style={{ fontWeight: "600" }}>{offer.travellerName}</Txt>
          <Txt style={[s.muted, { marginTop: 6 }]}>{money(offer.feeNaira)} · expires {timeDate(offer.expiresAt)}</Txt>
          <Txt style={[s.hint, { marginTop: 8 }]}>Gross {money(offer.quote.grossNaira)} · platform fee {money(offer.quote.platformFeeKobo / 100)} · traveller net {money(offer.quote.travellerNetKobo / 100)}</Txt>
          {offer.note ? <Txt style={{ marginTop: 10 }}>{offer.note}</Txt> : <Txt style={[s.hint, { marginTop: 10 }]}>No additional note.</Txt>}
          <View style={[s.wrap, { marginTop: 14 }]}>
            <Button title="Accept offer" busy={busy === `accept:${offer.id}`} disabled={!!busy} onPress={() => act(`accept:${offer.id}`, () => data.acceptOffer(offer.id), "Offer accepted. Payment is now available to the sender.")} />
            <Button title="Decline" variant="secondary" busy={busy === `decline:${offer.id}`} disabled={!!busy} onPress={() => act(`decline:${offer.id}`, () => data.declineOffer(offer.id), "Offer declined.")} />
          </View>
        </Card>) : (
          <View style={{ gap: 10 }}>
            {compatibleTravellerTrips.length > 0 ? (
              <View style={{ gap: 10 }}>
                <Txt style={s.detailLabel}>Compatible travellers on this route ({compatibleTravellerTrips.length})</Txt>
                <Txt style={s.muted}>These verified travellers have upcoming trips matching your route and parcel size. We are waiting for their carry offer:</Txt>
                {compatibleTravellerTrips.map(trip => (
                  <Card key={trip.id} style={{ padding: 14, backgroundColor: "#F9FAF7" }}>
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <Txt style={{ fontWeight: "600" }}>{trip.travellerName}</Txt>
                      <Badge label="Verified traveller" tone="green" />
                    </View>
                    <Txt style={[s.muted, { marginTop: 4 }]}>{trip.origin} → {trip.destination} · {timeDate(trip.departureAt)}</Txt>
                    <Txt style={[s.hint, { marginTop: 4 }]}>{tripAvailableCapacity(trip)} kg available space</Txt>
                  </Card>
                ))}
                {publicTripsStatus === "CanLoadMore" ? <Button title="Load more matching travellers" variant="secondary" onPress={() => loadMorePublicTrips(30)} /> : null}
              </View>
            ) : (
              <Notice>No traveller offers yet. When a verified traveller schedules a trip matching this route and parcel size, they'll see your parcel and can send a carry offer.</Notice>
            )}
          </View>
        )}
      </View>}

      {sender && shipment.status === "matched" && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>Your parcel has a travelling companion.</Txt>
        {selectedOffer && <Notice>Accepted offer from {selectedOffer.travellerName}: gross {money(selectedOffer.quote.grossNaira)} · platform fee {money(selectedOffer.quote.platformFeeKobo / 100)} · traveller net {money(selectedOffer.quote.travellerNetKobo / 100)}.</Notice>}
        <Txt style={s.muted}>Pay securely before handover. Payment is confirmed by the provider, not by returning to this app. Traveller payouts are sent automatically 24 hours after confirmed delivery, unless a dispute or payment issue needs review.</Txt>
        {!shipmentActions(shipment, actionViewer).pay && <Notice tone="warning">Secure checkout is not currently available. The payment deadline may have expired or your account needs attention; this reservation will reopen safely if payment was not completed.</Notice>}
        <Button title={`Pay securely · ${money(shipment.feeNaira)}`} icon={<ExternalLink size={15} color="white" />} busy={busy === "pay"} disabled={!!busy || !shipmentActions(shipment, actionViewer).pay} onPress={() => act("pay", () => data.pay(shipment.id), "Secure checkout opened. Complete payment there; this delivery updates when the provider confirms it.")} />
      </View>}

      {sender && shipment.status === "funded" ? <Button title="I'm handing over to the traveller" variant="lime" disabled={!shipmentActions(shipment, actionViewer).issueHandover} onPress={() => setHandoverMode("sender")} /> : null}

      {sender && shipment.status === "in_transit" && <View style={{ gap: 12 }}>
        <Button title="Send receiver code by SMS" variant="lime" onPress={() => setHandoverMode("receiver-code")} />
        <Button title="Share receiver code" variant="secondary" disabled={!!busy || !shipmentActions(shipment, actionViewer).requestReceiverCode} onPress={() => { setShareError(""); setShareDraft(null); setReceiverSheetOpen(true); }} />
      </View>}

      {traveller && shipment.status === "matched" && <Notice tone="warning">Waiting for the sender's payment. Do not collect the parcel until this app shows “Ready for handover”. A screenshot or payment promise is not confirmation.</Notice>}

      {traveller && ["funded", "in_transit"].includes(shipment.status) ? <Button title={shipment.status === "funded" ? "I've received the sender's parcel" : "I've handed it to the receiver"} variant="lime" onPress={() => setHandoverMode(shipment.status === "funded" ? "collect" : "deliver")} /> : null}

      {participant && shipment.status === "delivered" && <Notice tone="success">The receiver's code confirmed delivery. {shipment.paymentStatus === "released" ? "The traveller payout has been released." : "The traveller payout is sent automatically 24 hours after confirmed delivery. Report any issue below."}</Notice>}
      {participant && shipment.status === "delivered" && <View style={{ marginTop: 20 }}><DeliveryReview shipment={shipment} /></View>}

      {!sender && !traveller && shipment.status === "open" && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>Take this parcel along.</Txt>
        {matching.length === 0 ? <Notice>No eligible trip on your account matches this route and weight. Publish a future trip with enough capacity to accept it.</Notice> : matching.map(trip => {
          const senderVerified = shipment.senderVerified === true;
          const existing = myOffers.find(offer => offer.tripId === trip.id && offer.status === "pending");
          return <Card key={trip.id} style={{ padding: 17 }}>
            <Txt style={{ fontWeight: "600", marginBottom: 7 }}>{trip.origin} → {trip.destination} · {timeDate(trip.departureAt)}</Txt>
            <Txt style={[s.muted, { marginBottom: 12 }]}>{tripAvailableCapacity(trip)} kg remaining · fixed delivery fee {money(shipment.feeNaira)}</Txt>
            {!senderVerified && <Txt style={[s.hint, { color: colors.amber, marginBottom: 9 }]}>Sender identity review is not complete.</Txt>}
            {existing && <Notice>Offer sent for {money(existing.feeNaira)} · expires {timeDate(existing.expiresAt)}. Withdraw it before sending a replacement.</Notice>}
            <Field label="Offer note (optional)" value={offerNote} onChangeText={setOfferNote} placeholder="Pickup timing, flexibility, or relevant handling notes" maxLength={500} hint="Keep it factual. Never include a private code." />
            <Field label="Offer expiry (hours)" value={offerExpires} onChangeText={setOfferExpires} keyboardType="number-pad" placeholder="24" hint="Up to 48 hours, and always before departure." />
            <View style={[s.wrap, { marginTop: 12 }]}> 
              <Button title={existing ? "Offer already pending" : "Send offer for this trip"} disabled={!!busy || !senderVerified || viewer?.verification !== "verified" || !!existing} busy={busy === trip.id} onPress={() => act(trip.id, async () => {
                const expiresHours = Number(offerExpires);
                if (!Number.isFinite(expiresHours) || expiresHours <= 0) throw new Error("Enter an expiry in hours.");
                await data.matchShipment(shipment.id, trip.id, { expiresAt: Date.now() + expiresHours * 3600000, note: offerNote.trim() });
              }, "Offer sent. The sender can now review and accept it.")} />
            </View>
          </Card>;
        })}
        {ownTripsStatus === "CanLoadMore" ? <Button title="Load more of my trips" variant="secondary" onPress={() => loadMoreOwnTrips(30)} /> : null}
      </View>}

      {error !== "" && <View style={{ marginTop: 16 }}><Notice tone="error">{error}</Notice></View>}
      {notice !== "" && <View style={{ marginTop: 16 }}><Notice tone="success">{notice}</Notice></View>}

      {participant && <>
        <View style={s.divider} />
        <Txt style={[s.detailLabel, { marginBottom: 18 }]}>Confirmed activity</Txt>
        {events.length === 0 ? <Txt style={s.muted}>No additional events recorded for this parcel yet. Current status: {STATUS_LABELS[shipment.status]}.</Txt> : events.map((event, i) => <View key={event.id} style={{ flexDirection: "row", gap: 14, paddingBottom: 20 }}>
          <View style={{ width: 10, alignItems: "center", paddingTop: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === 0 ? colors.forest : "#B7C2AC" }} />
            {i < events.length - 1 && <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 5, marginBottom: -15 }} />}
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: "600", fontSize: 12 }}>{event.action}</Txt>
            <Txt style={[s.muted, { marginTop: 5 }]}>{event.detail}</Txt>
            <Txt style={[s.hint, { marginTop: 5 }]}>{event.actorName} · {timeDate(event.createdAt)}</Txt>
          </View>
        </View>)}
        <View style={s.divider} />
        {sender && onEdit && shipment.status !== "rejected" && <Button title="Edit parcel declaration" variant="secondary" disabled={!!busy} onPress={onEdit} />}
        {(shipment.handoverEvidenceIds?.length || shipment.deliveryEvidenceIds?.length) ? <View style={{ gap: 12 }}><Txt style={s.h3}>Handover photos</Txt><EvidenceGallery ids={[...(shipment.handoverEvidenceIds ?? []), ...(shipment.deliveryEvidenceIds ?? [])]} /></View> : null}
        {(shipment.receiverPickupSmsStatus || shipment.receiverDeliverySmsStatus) ? <Txt style={s.hint}>{(shipment.status === "delivered" ? shipment.receiverDeliverySmsStatus : shipment.receiverPickupSmsStatus) === "failed" ? "Receiver update could not be sent. Contact the receiver directly." : (shipment.status === "delivered" ? shipment.receiverDeliverySmsStatus : shipment.receiverPickupSmsStatus) === "sent" ? "Receiver update accepted by SMS service." : "Receiver SMS update queued."}</Txt> : null}
        <Conversation shipment={shipment} />
        {shipment.status === "disputed" && (snapshot?.disputes ?? []).filter(d => d.shipmentId === shipment.id).map(d => <Notice key={d.id} tone="warning">Dispute {d.status}: {d.reason}</Notice>)}
        {sender && ["pending_review", "open", "matched"].includes(shipment.status) && (cancelling ? <View style={{ gap: 10, marginTop: 12 }}>
          <Notice tone="warning">Cancel this shipment? It will no longer be available. If checkout has already started, cancellation may be blocked for payment safety.</Notice>
          <View style={s.row}>
            <Button title="Keep shipment" variant="secondary" onPress={() => setCancelling(false)} disabled={!!busy} />
            <Button title="Yes, cancel" variant="danger" busy={busy === "cancel"} disabled={!!busy} onPress={() => act("cancel", async () => { await data.cancelShipment(shipment.id); setCancelling(false); }, "Shipment cancelled.")} />
          </View>
        </View> : <Button title="Cancel shipment" variant="ghost" disabled={!!busy} onPress={() => setCancelling(true)} />)}
        {["matched", "funded", "in_transit", "delivered"].includes(shipment.status) && !["released", "refunded"].includes(shipment.paymentStatus) && (disputing ? <View style={{ gap: 8, marginTop: 12 }}>
          <Field label="What happened?" hint="Include relevant details. Never include a private handover or delivery code." value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Tell our operations team what needs reviewing…" />
          <View style={s.row}>
            <BackButton onPress={() => setDisputing(false)} disabled={!!busy} />
            <Button title="Raise dispute" variant="danger" busy={busy === "dispute"} disabled={!!busy || reason.trim().length < 10} onPress={() => act("dispute", async () => { await data.raiseDispute(shipment.id, reason.trim()); setDisputing(false); }, "Your dispute is open. Operations will review the recorded milestones.")} />
          </View>
        </View> : <Button title="Something wrong? Raise a dispute" variant="ghost" disabled={!!busy} onPress={() => setDisputing(true)} />)}
      </>}
    </Sheet>

    {receiverSheetOpen && <ReceiverCodeSheet
      receiverPhone={shipment.receiverPhone}
      busy={shareBusy}
      disabled={!!shareBusy || !shipmentActions(shipment, actionViewer).requestReceiverCode}
      error={shareError}
      onClose={() => { if (!shareBusy) { setReceiverSheetOpen(false); setShareError(""); } }}
      onShareSms={() => void shareReceiverCode("sms")}
      onShareWhatsApp={() => void shareReceiverCode("whatsapp")}
    />}
  </>;
}
