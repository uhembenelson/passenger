import React, { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { findMatchingTrips, money, shipmentActions, STATUS_LABELS } from "@passenger/core";
import type { Offer, Shipment } from "@passenger/core";
import { usePassenger } from "./data";
import { receiverCodeMessage, receiverCodeSmsUrl, receiverCodeWhatsAppUrl } from "./receiver-code-share";
import { ReceiverCodeSheet } from "./receiver-code-sheet";
import { Conversation, DeliveryReview } from "./social";
import { Badge, Button, Card, colors, errorMessage, Field, Notice, RouteLine, s, Sheet, Status, timeDate, Txt } from "./ui";

function tripAvailableCapacity(trip: { capacityKg: number; legReservedKg?: number[]; reservedKg?: number }) {
  const reserved = trip.legReservedKg?.length ? Math.max(...trip.legReservedKg) : trip.reservedKg ?? 0;
  return Math.max(0, trip.capacityKg - reserved);
}

export function DeliveryDetail({ shipment, onClose, onEdit }: { shipment: Shipment; onClose: () => void; onEdit?: () => void }) {
  const data = usePassenger();
  const snapshot = data.snapshot!;
  const viewer = snapshot.viewer!;
  const sender = shipment.senderId === viewer.id;
  const traveller = shipment.travellerId === viewer.id;
  const participant = sender || traveller;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offerExpires, setOfferExpires] = useState("24");
  const [disputing, setDisputing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [receiverSheetOpen, setReceiverSheetOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<"" | "sms" | "whatsapp">("");
  const [shareError, setShareError] = useState("");
  const [shareDraft, setShareDraft] = useState<{ code: string; receiverPhone: string; reference: string } | null>(null);

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

  const matching = findMatchingTrips(shipment, snapshot.trips).filter(t => t.travellerId === viewer.id);
  const offers = (snapshot.offers ?? []).filter((offer): offer is Offer => offer.shipmentId === shipment.id);
  const myOffers = offers.filter(offer => offer.travellerId === viewer.id).sort((a, b) => b.createdAt - a.createdAt);
  const senderOffers = offers.filter(offer => offer.status === "pending").sort((a, b) => a.expiresAt - b.expiresAt);
  const selectedOffer = useMemo(() => offers.find(offer => offer.status === "accepted"), [offers]);
  const events = snapshot.events.filter(e => e.shipmentId === shipment.id).sort((a, b) => b.createdAt - a.createdAt);
  const issueKind = shipment.status === "funded" ? "handover" : "delivery";
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
      await Linking.openURL(url);
    } catch (e) {
      setShareError(errorMessage(e));
    } finally {
      setShareBusy("");
    }
  };

  return <>
    <Sheet title={`${shipment.origin} to ${shipment.destination}`} eyebrow={`${shipment.reference}  /  DELIVERY DETAILS`} onClose={() => !busy && onClose()} wide>
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
        <Txt style={s.eyebrow}>MILESTONE TRACKING · NOT LIVE GPS</Txt>
        {step >= 0 ? <View style={{ flexDirection: "row", marginTop: 5, marginBottom: 20 }}>
          {steps.map((label, index) => <View key={label} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: "100%", alignItems: "center", justifyContent: "center", height: 25 }}>
              {index < steps.length - 1 && <View style={{ position: "absolute", left: "50%", right: "-50%", height: 2, backgroundColor: index < step ? colors.forest : colors.border }} />}
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: index <= step ? colors.forest : colors.soft, alignItems: "center", justifyContent: "center", borderWidth: index === step ? 3 : 0, borderColor: colors.lime }}>
                <Txt style={{ color: index <= step ? "white" : colors.muted, fontSize: 10 }}>{index < step ? "✓" : index + 1}</Txt>
              </View>
            </View>
            <Txt style={{ fontSize: 9, marginTop: 8, color: index <= step ? colors.forest : colors.muted }}>{label}</Txt>
          </View>)}
        </View> : <Notice tone={shipment.status === "cancelled" ? "neutral" : "warning"}>
          {shipment.status === "disputed"
            ? "Delivery is paused while operations reviews the dispute. No automatic payout is made."
            : shipment.status === "rejected"
              ? "Operations requested changes before this parcel can be published."
              : "This parcel was cancelled. It is no longer available for matching."}
        </Notice>}
      </View>

      {participant && <>
        <View style={s.divider} />
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <View style={{ flex: 1 }}>
            <Txt style={s.eyebrow}>SENDER</Txt>
            <Txt style={s.h3}>{shipment.senderName}</Txt>
            <Txt style={[s.eyebrow, { marginTop: 20 }]}>TRAVELLER</Txt>
            <Txt>{shipment.travellerName || "Not yet matched"}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={s.eyebrow}>RECEIVER</Txt>
            <Txt style={s.h3}>{shipment.receiverName}</Txt>
            <Txt style={[s.muted, { marginTop: 5 }]}>{shipment.receiverPhone}</Txt>
            <Txt style={[s.eyebrow, { marginTop: 20 }]}>PAYMENT</Txt>
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
        </Card>) : <Notice>No traveller offers yet. Travellers must publish a compatible trip and send an offer before you can move forward.</Notice>}
      </View>}

      {sender && shipment.status === "matched" && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>Your parcel has a travelling companion.</Txt>
        {selectedOffer && <Notice>Accepted offer from {selectedOffer.travellerName}: gross {money(selectedOffer.quote.grossNaira)} · platform fee {money(selectedOffer.quote.platformFeeKobo / 100)} · traveller net {money(selectedOffer.quote.travellerNetKobo / 100)}.</Notice>}
        <Txt style={s.muted}>Pay securely before handover. Payment is confirmed by the provider, not by returning to this app. Traveller payouts remain held until delivery confirmation and review.</Txt>
        {!shipmentActions(shipment, viewer).pay && <Notice tone="warning">Secure checkout is not currently available. The payment deadline may have expired or your account needs attention; this reservation will reopen safely if payment was not completed.</Notice>}
        <Button title={`Pay securely · ${money(shipment.feeNaira)}  ↗`} busy={busy === "pay"} disabled={!!busy || !shipmentActions(shipment, viewer).pay} onPress={() => act("pay", () => data.pay(shipment.id), "Secure checkout opened. Complete payment there; this delivery updates when the provider confirms it.")} />
      </View>}

      {sender && ["funded", "in_transit"].includes(shipment.status) && issueKind === "handover" && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>Ready to hand over your parcel?</Txt>
        <Txt style={s.muted}>Inspect the parcel together. Generate a code and share it with the assigned traveller only when you physically hand over the parcel.</Txt>
        <Button title={secret ? "Generate a replacement code" : "Generate handover code"} variant="secondary" busy={busy === "issue"} disabled={!!busy || !shipmentActions(shipment, viewer).issueHandover} onPress={() => act("issue", async () => { const next = await data.issueCode(shipment.id, "handover"); setSecret(next ?? ""); })} />
        {secret !== "" && <View style={{ padding: 20, backgroundColor: colors.forest, borderRadius: 12, alignItems: "center", gap: 8 }}>
          <Txt style={{ color: colors.lime, fontSize: 10, letterSpacing: 2 }}>PRIVATE · HANDOVER CODE</Txt>
          <Txt selectable style={{ color: "white", fontSize: 34, letterSpacing: 8, fontWeight: "600" }}>{secret}</Txt>
          <Txt style={{ color: "#CBD6C5", fontSize: 11, textAlign: "center", lineHeight: 18 }}>Expires in 10 minutes. Request a replacement after 1 minute (maximum 3 per hour). A replacement invalidates the previous code. Never post it publicly or send it before handover.</Txt>
        </View>}
      </View>}

      {sender && shipment.status === "in_transit" && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>Delivery code</Txt>
        <Button title="Share receiver code" variant="secondary" disabled={!!busy || !shipmentActions(shipment, viewer).requestReceiverCode} onPress={() => { setShareError(""); setShareDraft(null); setReceiverSheetOpen(true); }} />
      </View>}

      {traveller && shipment.status === "matched" && <Notice tone="warning">Waiting for the sender's payment. Do not collect the parcel until this app shows “Ready for handover”. A screenshot or payment promise is not confirmation.</Notice>}

      {traveller && ["funded", "in_transit"].includes(shipment.status) && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>{issueKind === "handover" ? "Confirm physical handover" : "Confirm receipt with the receiver"}</Txt>
        <Txt style={s.muted}>{issueKind === "handover" ? "Check the declared contents with the sender first. Enter the sender's code only when you take possession of the parcel." : "Ask the receiver for their private delivery code only after they inspect and receive the parcel. Passenger never displays their code to you."}</Txt>
        <Field label={issueKind === "handover" ? "Code from the sender" : "Code from the receiver"} value={code} onChangeText={setCode} placeholder="Enter one-time code" autoComplete="off" keyboardType="number-pad" maxLength={8} hint="Eight digits · codes expire in 10 minutes · five attempts maximum" />
        <Button title={issueKind === "handover" ? "Confirm handover" : "Confirm delivery"} busy={busy === "confirm"} disabled={!!busy || !code.trim() || (issueKind === "handover" ? !shipmentActions(shipment, viewer).confirmHandover : !shipmentActions(shipment, viewer).confirmDelivery)} onPress={() => act("confirm", async () => {
          await (issueKind === "handover" ? data.confirmHandover : data.confirmDelivery)(shipment.id, code.trim());
          setCode("");
        }, issueKind === "handover" ? "Handover confirmed. Your delivery is now in transit." : "Delivery confirmed. Payout remains subject to operations review.")} />
      </View>}

      {participant && shipment.status === "delivered" && <Notice tone="success">The receiver's code confirmed delivery. {shipment.paymentStatus === "released" ? "The traveller payout has been released." : "The traveller payout is held until operations review. Report any issue below."}</Notice>}

      {!sender && !traveller && shipment.status === "open" && <View style={{ gap: 12 }}>
        <Txt style={s.h3}>Take this parcel along.</Txt>
        {matching.length === 0 ? <Notice>No eligible trip on your account matches this route and weight. Publish a future trip with enough capacity to accept it.</Notice> : matching.map(trip => {
          const senderVerified = snapshot.people.find(p => p.id === shipment.senderId)?.verification === "verified";
          const existing = myOffers.find(offer => offer.tripId === trip.id && offer.status === "pending");
          return <Card key={trip.id} style={{ padding: 17 }}>
            <Txt style={{ fontWeight: "600", marginBottom: 7 }}>{trip.origin} → {trip.destination} · {timeDate(trip.departureAt)}</Txt>
            <Txt style={[s.muted, { marginBottom: 12 }]}>{tripAvailableCapacity(trip)} kg remaining · fixed delivery fee {money(shipment.feeNaira)}</Txt>
            {!senderVerified && <Txt style={[s.hint, { color: colors.amber, marginBottom: 9 }]}>Sender identity review is not complete.</Txt>}
            {existing && <Notice>Offer sent for {money(existing.feeNaira)} · expires {timeDate(existing.expiresAt)}. Withdraw it before sending a replacement.</Notice>}
            <Field label="Offer note (optional)" value={offerNote} onChangeText={setOfferNote} placeholder="Pickup timing, flexibility, or relevant handling notes" maxLength={500} hint="Keep it factual. Never include a private code." />
            <Field label="Offer expiry (hours)" value={offerExpires} onChangeText={setOfferExpires} keyboardType="number-pad" placeholder="24" hint="Up to 48 hours, and always before departure." />
            <View style={[s.wrap, { marginTop: 12 }]}> 
              <Button title={existing ? "Offer already pending" : "Send offer for this trip"} disabled={!!busy || !senderVerified || viewer.verification !== "verified" || !!existing} busy={busy === trip.id} onPress={() => act(trip.id, async () => {
                const expiresHours = Number(offerExpires);
                if (!Number.isFinite(expiresHours) || expiresHours <= 0) throw new Error("Enter an expiry in hours.");
                await data.matchShipment(shipment.id, trip.id, { expiresAt: Date.now() + expiresHours * 3600000, note: offerNote.trim() });
              }, "Offer sent. The sender can now review and accept it.")} />
            </View>
          </Card>;
        })}
      </View>}

      {error !== "" && <View style={{ marginTop: 16 }}><Notice tone="error">{error}</Notice></View>}
      {notice !== "" && <View style={{ marginTop: 16 }}><Notice tone="success">{notice}</Notice></View>}

      {participant && <>
        <View style={s.divider} />
        <Txt style={[s.eyebrow, { marginBottom: 18 }]}>CONFIRMED ACTIVITY</Txt>
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
        <Conversation shipment={shipment} />
        {shipment.status === "delivered" && <><View style={s.divider} /><DeliveryReview shipment={shipment} /></>}
        {shipment.status === "disputed" && snapshot.disputes.filter(d => d.shipmentId === shipment.id).map(d => <Notice key={d.id} tone="warning">Dispute {d.status}: {d.reason}</Notice>)}
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
            <Button title="Go back" variant="secondary" onPress={() => setDisputing(false)} disabled={!!busy} />
            <Button title="Raise dispute" variant="danger" busy={busy === "dispute"} disabled={!!busy || reason.trim().length < 10} onPress={() => act("dispute", async () => { await data.raiseDispute(shipment.id, reason.trim()); setDisputing(false); }, "Your dispute is open. Operations will review the recorded milestones.")} />
          </View>
        </View> : <Button title="Something wrong? Raise a dispute" variant="ghost" disabled={!!busy} onPress={() => setDisputing(true)} />)}
      </>}
    </Sheet>

    {receiverSheetOpen && <ReceiverCodeSheet
      receiverPhone={shipment.receiverPhone}
      busy={shareBusy}
      disabled={!!shareBusy || !shipmentActions(shipment, viewer).requestReceiverCode}
      error={shareError}
      onClose={() => { if (!shareBusy) { setReceiverSheetOpen(false); setShareError(""); } }}
      onShareSms={() => void shareReceiverCode("sms")}
      onShareWhatsApp={() => void shareReceiverCode("whatsapp")}
    />}
  </>;
}
