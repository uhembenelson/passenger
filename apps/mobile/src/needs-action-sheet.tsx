import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { money, shipmentActions } from "@passenger/core";
import type { Offer, Shipment } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { Button, Card, errorMessage, Field, Notice, PresentationSheet, Txt, fontFamily, timeDate } from "./ui";

type Props = {
  shipment: Shipment;
  onClose: () => void;
  onEdit: () => void;
};

export function NeedsActionSheet({ shipment, onClose, onEdit }: Props) {
  const data = usePassenger();
  const snapshot = data.snapshot!;
  const viewer = snapshot.viewer!;
  const sender = shipment.senderId === viewer.id;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [profileOfferId, setProfileOfferId] = useState("");
  const actions = shipmentActions(shipment, viewer);
  const offers = useMemo(() => (snapshot.offers ?? [])
    .filter((offer): offer is Offer => offer.shipmentId === shipment.id && offer.status === "pending")
    .sort((a, b) => a.expiresAt - b.expiresAt), [snapshot.offers, shipment.id]);

  const act = async (key: string, task: () => Promise<void>, success?: string, closeAfter = false) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await task();
      if (success) setNotice(success);
      if (closeAfter) onClose();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy("");
    }
  };

  const title = actionTitle(shipment, sender, offers.length);

  return <PresentationSheet title={title} onClose={() => !busy && onClose()}>
    <ActionContext shipment={shipment} />

    {shipment.status === "rejected" ? <View style={a.section}>
      <Notice tone="warning">{shipment.reviewNote || "Update the parcel details requested by the review team, then resubmit."}</Notice>
      <Button title="Fix & resubmit" variant="lime" onPress={onEdit} disabled={!!busy} />
    </View> : null}

    {sender && shipment.status === "open" ? <View style={a.section}>
      <Txt style={a.supporting}>Choose the traveller whose timing and note work for this delivery. Passenger keeps the delivery fee fixed.</Txt>
      {offers.map(offer => <Card key={offer.id} style={a.offerCard}>
        <View style={a.offerHeading}>
          <Txt style={a.offerName}>{offer.travellerName}</Txt>
          <Txt style={a.offerFee}>{money(offer.feeNaira)}</Txt>
        </View>
        <Txt style={a.meta}>Expires {timeDate(offer.expiresAt)}</Txt>
        {offer.note ? <Txt style={a.offerNote}>{offer.note}</Txt> : null}
        {profileOfferId === offer.id ? <TravellerPreview offer={offer} /> : null}
        <Button title={profileOfferId === offer.id ? "Hide traveller profile" : "View traveller profile"} variant="ghost" small disabled={!!busy} onPress={() => setProfileOfferId(current => current === offer.id ? "" : offer.id)} />
        <View style={a.offerActions}>
          <Button title="Decline" variant="secondary" small disabled={!!busy} busy={busy === `decline:${offer.id}`} style={a.offerAction} onPress={() => void act(`decline:${offer.id}`, () => data.declineOffer(offer.id), undefined, offers.length === 1)} />
          <Button title="Accept offer" variant="lime" small disabled={!!busy} busy={busy === `accept:${offer.id}`} style={a.offerAction} onPress={() => void act(`accept:${offer.id}`, () => data.acceptOffer(offer.id), "Offer accepted. You can now pay securely.")} />
        </View>
      </Card>)}
    </View> : null}

    {sender && shipment.status === "matched" ? <View style={a.section}>
      <Txt style={a.supporting}>Pay now to reserve the traveller. Your payment stays protected until delivery is confirmed.</Txt>
      {shipment.payByAt ? <Txt style={a.meta}>Complete payment by {timeDate(shipment.payByAt)}</Txt> : null}
      <Button title={`Pay securely · ${money(shipment.feeNaira)}`} variant="lime" busy={busy === "pay"} disabled={!!busy || !actions.pay} onPress={() => void act("pay", () => data.pay(shipment.id))} />
      {!actions.pay ? <Notice tone="warning">Payment is unavailable. Check your verification status or payment deadline.</Notice> : null}
    </View> : null}

    {sender && shipment.status === "funded" ? <View style={a.section}>
      <Txt style={a.supporting}>Share this code only when the assigned traveller is physically taking the parcel from you.</Txt>
      {secret ? <View style={a.codeBlock}>
        <Txt style={a.codeLabel}>PRIVATE HANDOVER CODE</Txt>
        <Txt selectable style={a.code}>{secret}</Txt>
        <Txt style={a.codeHelp}>Expires in 10 minutes. A replacement invalidates the previous code.</Txt>
      </View> : null}
      <Button title={secret ? "Generate replacement code" : "Generate handover code"} variant={secret ? "secondary" : "lime"} busy={busy === "issue"} disabled={!!busy || !actions.issueHandover} onPress={() => void act("issue", async () => setSecret(await data.issueCode(shipment.id, "handover") ?? ""))} />
    </View> : null}

    {!sender && shipment.status === "funded" ? <CodeConfirmation
      title="Enter the sender's code only after you have checked and collected the parcel."
      label="Handover code"
      button="Confirm handover"
      code={code}
      busy={busy === "confirm"}
      disabled={!!busy || !actions.confirmHandover}
      onCode={setCode}
      onSubmit={() => void act("confirm", () => data.confirmHandover(shipment.id, code.trim()), undefined, true)}
    /> : null}

    {!sender && shipment.status === "in_transit" ? <CodeConfirmation
      title="Ask the receiver for their code after they have inspected and received the parcel."
      label="Receiver code"
      button="Confirm delivery"
      code={code}
      busy={busy === "confirm"}
      disabled={!!busy || !actions.confirmDelivery}
      onCode={setCode}
      onSubmit={() => void act("confirm", () => data.confirmDelivery(shipment.id, code.trim()), undefined, true)}
    /> : null}

    {shipment.status === "disputed" ? <View style={a.section}>
      <Notice tone="warning">This delivery is paused while the support team reviews the issue. Payment will not move automatically.</Notice>
      {snapshot.disputes.filter(dispute => dispute.shipmentId === shipment.id).map(dispute => <View key={dispute.id} style={a.disputeSummary}>
        <Txt style={a.meta}>ISSUE REPORTED</Txt>
        <Txt style={a.offerNote}>{dispute.reason}</Txt>
      </View>)}
    </View> : null}

    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
  </PresentationSheet>;
}

function TravellerPreview({ offer }: { offer: Offer }) {
  const { snapshot } = usePassenger();
  const person = snapshot!.people.find(item => item.id === offer.travellerId);
  const trip = snapshot!.trips.find(item => item.id === offer.tripId);
  const profile = useQuery(api.marketplaceProfiles.publicProfile, { userId: offer.travellerId as Id<"users"> });
  return <View style={a.profile}>
    <View style={a.profileStats}>
      <Txt style={a.profileValue}>{person?.rating?.toFixed(1) ?? "—"}</Txt><Txt style={a.meta}>rating</Txt>
      <Txt style={a.profileValue}>{person?.reviewCount ?? 0}</Txt><Txt style={a.meta}>reviews</Txt>
      <Txt style={a.profileValue}>{person?.successfulDeliveries ?? 0}</Txt><Txt style={a.meta}>deliveries</Txt>
    </View>
    {trip ? <><Txt style={a.offerNote}>{trip.origin} → {trip.destination} · {timeDate(trip.departureAt)}</Txt><Txt style={a.meta}>{trip.acceptedCategories?.length ? trip.acceptedCategories.join(", ") : "All supported categories"}{trip.handlingNotes ? ` · ${trip.handlingNotes}` : ""}</Txt></> : null}
    {profile?.reviews.slice(0, 3).map(review => <View key={review.id} style={a.review}><Txt style={a.meta}>{review.rating} / 5</Txt><Txt style={a.offerNote}>{review.comment}</Txt></View>)}
  </View>;
}

function ActionContext({ shipment }: { shipment: Shipment }) {
  return <View style={a.context}>
    <Txt style={a.route}>{shipment.origin} → {shipment.destination}</Txt>
    <Txt style={a.meta}>{shipment.reference}</Txt>
  </View>;
}

function CodeConfirmation({ title, label, button, code, busy, disabled, onCode, onSubmit }: {
  title: string;
  label: string;
  button: string;
  code: string;
  busy: boolean;
  disabled: boolean;
  onCode: (value: string) => void;
  onSubmit: () => void;
}) {
  return <View style={a.section}>
    <Txt style={a.supporting}>{title}</Txt>
    <Field label={label} value={code} onChangeText={onCode} placeholder="Enter 8-digit code" autoComplete="off" keyboardType="number-pad" maxLength={8} />
    <Button title={button} variant="lime" busy={busy} disabled={disabled || code.trim().length !== 8} onPress={onSubmit} />
  </View>;
}

function actionTitle(shipment: Shipment, sender: boolean, offerCount: number) {
  if (shipment.status === "rejected") return "Update parcel details";
  if (shipment.status === "open") return `Review ${offerCount} offer${offerCount === 1 ? "" : "s"}`;
  if (shipment.status === "matched") return sender ? "Pay for delivery" : "Payment pending";
  if (shipment.status === "funded") return sender ? "Prepare handover" : "Confirm handover";
  if (shipment.status === "in_transit") return sender ? "Manage delivery proof" : "Confirm delivery";
  if (shipment.status === "disputed") return "Delivery under review";
  return "Delivery action";
}

const a = StyleSheet.create({
  context: { gap: components.actionSheet.compactGap },
  route: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  meta: { color: semantic.color.text.tertiary, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
  section: { gap: components.actionSheet.sectionGap },
  supporting: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  offerCard: { padding: primitives.space[4], gap: components.actionSheet.compactGap, shadowOpacity: primitives.opacity.none },
  offerHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: primitives.space[3] },
  offerName: { flex: 1, color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.medium },
  offerFee: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.semibold },
  offerNote: { color: semantic.color.text.secondary, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  offerActions: { flexDirection: "row", gap: primitives.space[2], marginTop: primitives.space[2] },
  offerAction: { flex: 1 },
  codeBlock: { alignItems: "center", gap: primitives.space[2], padding: components.actionSheet.codePadding, borderRadius: primitives.radius.lg, backgroundColor: semantic.color.text.primary },
  codeLabel: { color: semantic.color.brand.primary, fontSize: primitives.typography.size.labelSm, lineHeight: primitives.typography.lineHeight.labelSm, fontFamily: fontFamily.medium },
  code: { color: semantic.color.text.onPrimary, fontSize: components.actionSheet.codeSize, lineHeight: components.actionSheet.codeSize, letterSpacing: components.actionSheet.codeLetterSpacing, fontFamily: fontFamily.semibold },
  codeHelp: { color: primitives.color.green[100], fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, textAlign: "center", fontFamily: fontFamily.regular },
  disputeSummary: { gap: components.actionSheet.compactGap, padding: primitives.space[4], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.subtle },
  profile: { gap: primitives.space[2], padding: primitives.space[3], borderRadius: primitives.radius.lg, backgroundColor: semantic.color.background.subtle },
  profileStats: { flexDirection: "row", alignItems: "baseline", gap: primitives.space[2], flexWrap: "wrap" },
  profileValue: { color: semantic.color.text.primary, fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd, fontFamily: fontFamily.semibold },
  review: { gap: primitives.space[1], paddingTop: primitives.space[2], borderTopWidth: primitives.borderWidth.sm, borderTopColor: semantic.color.border.subtle },
});
