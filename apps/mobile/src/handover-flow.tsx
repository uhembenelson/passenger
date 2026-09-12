import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, PackageCheck } from "lucide-react-native";
import type { Shipment } from "@passenger/core";
import { usePassenger } from "./data";
import { EvidencePicker } from "./evidence";
import { BackButton, Button, colors, errorMessage, Field, fontFamily, Notice, Txt } from "./ui";

export type HandoverMode = "sender" | "collect" | "deliver" | "receiver-code";
export function HandoverFlow({ shipment, mode, onClose }: { shipment: Shipment; mode: HandoverMode; onClose: () => void }) {
  const data = usePassenger();
  const [page, setPage] = useState<"intro" | "photo" | "code" | "done">("intro");
  const [photos, setPhotos] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const senderConfirmed = mode === "sender" && ["in_transit", "delivered"].includes(shipment.status);
  const done = page === "done" || senderConfirmed;
  const locked = busy || uploading;
  const delivery = mode === "deliver";
  const stageValid = done || (mode === "sender" || mode === "collect" ? shipment.status === "funded" : shipment.status === "in_transit");
  const title = done ? mode === "receiver-code" ? "Code sent" : delivery ? "Parcel delivered" : "Parcel handed over"
    : page === "photo" ? "Capture the handover"
    : page === "code" ? mode === "sender" ? "Share this in person" : delivery ? "Receiver's code" : "Sender's code"
    : mode === "sender" ? "Ready to hand over?" : mode === "collect" ? "Have the parcel?" : delivery ? "With the receiver?" : "Notify the receiver";
  const copy = done ? mode === "receiver-code" ? "Expires in 10 minutes." : ""
    : page === "photo" ? "Keep faces and private codes out of the photo."
    : page === "code" ? mode === "sender" ? "Share only as the traveller takes the parcel." : delivery ? "Enter only after the receiver has the parcel." : "Enter only after you have the parcel."
    : mode === "sender" ? `Check the parcel with ${shipment.travellerName || "the traveller"}.` : mode === "collect" ? "Check the parcel with the sender." : delivery ? `Let ${shipment.receiverName || "the receiver"} inspect the parcel.` : "Send when the receiver is ready to collect.";
  const run = async (task: () => Promise<void>) => {
    if (locked || data.offline) return;
    setBusy(true); setError("");
    try { await task(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const back = () => {
    if (locked) return;
    setError("");
    if (done || page === "intro" || mode === "sender") onClose();
    else setPage(page === "code" ? "photo" : "intro");
  };
  const smsStatus = delivery ? shipment.receiverDeliverySmsStatus : shipment.receiverPickupSmsStatus;
  return <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={back}>
    <SafeAreaView style={h.screen}>
      <View style={{ marginLeft: 16 }}><BackButton accessibilityLabel="Back" disabled={locked} onPress={back} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={h.scroll}>
        <View style={h.content}>
          <View style={h.icon}>{done ? <Check size={44} color={colors.forest} /> : <PackageCheck size={44} strokeWidth={1.5} color={colors.forest} />}</View>
          <Txt accessibilityRole="header" style={h.title}>{title}</Txt>
          {!done && page === "intro" ? <Txt style={h.reference}>{shipment.origin} to {shipment.destination}</Txt> : null}
          {copy ? <Txt style={h.copy}>{copy}</Txt> : null}
          <View style={h.actions}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {!stageValid ? <Notice>Parcel status changed. Go back to refresh.</Notice> : null}
            {data.offline && !done ? <Notice>Reconnect to save handover or send a code.</Notice> : null}
            {done ? <>
              {mode !== "receiver-code" && smsStatus === "failed" ? <Notice tone="warning">SMS failed. Contact the receiver directly.</Notice> : null}
              <Button title="Done" variant="lime" onPress={onClose} />
            </> : page === "intro" ? <Button
              title={mode === "sender" ? "I'm handing over to the traveller" : mode === "collect" ? "I've received the sender's parcel" : delivery ? "I've handed it to the receiver" : "Send receiver code by SMS"}
              variant="lime" busy={busy} disabled={data.offline || !stageValid} onPress={() => {
                if (mode === "sender") void run(async () => { setSecret(await data.issueCode(shipment.id, "handover") ?? ""); setPage("code"); });
                else if (mode === "receiver-code") void run(async () => { await data.issueCode(shipment.id, "delivery"); setPage("done"); });
                else setPage("photo");
              }} /> : page === "photo" ? <>
                <EvidencePicker purpose="parcel" compact minimal value={photos} onChange={setPhotos} disabled={busy || !stageValid} onBusyChange={setUploading} />
                <Button title={photos.length ? "Continue with photo" : "Continue without a photo"} variant={photos.length ? "lime" : "secondary"} disabled={locked || !stageValid} onPress={() => { setError(""); setPage("code"); }} />
              </> : mode === "sender" ? <>
                <View style={h.codeBlock}><Txt selectable style={h.code}>{secret}</Txt></View>
                <Txt style={h.note}>Expires in 10 minutes.</Txt>
                <Button title="New code" small variant="ghost" busy={busy} disabled={data.offline || !stageValid} onPress={() => void run(async () => setSecret(await data.issueCode(shipment.id, "handover") ?? ""))} />
              </> : <>
                <Field label="8-digit code" value={code} onChangeText={value => setCode(value.replace(/\D/g, ""))} placeholder="8-digit code" keyboardType="number-pad" autoComplete="off" maxLength={8} editable={!locked} />
                <Button title={delivery ? "Confirm delivery" : "Confirm collection"} variant="lime" busy={busy} disabled={data.offline || uploading || !stageValid || !/^\d{8}$/.test(code)} onPress={() => void run(async () => {
                  await (delivery ? data.confirmDelivery : data.confirmHandover)(shipment.id, code, photos);
                  setCode(""); setPage("done");
                })} />
                <Txt style={h.note}>{delivery ? "Need a code? Ask the sender." : "Need a code? Ask the sender."}</Txt>
              </>}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const h = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, paddingBottom: 64 },
  content: { width: "100%", maxWidth: 420, alignItems: "center" },
  icon: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#E5EED5", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  reference: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 12 },
  title: { fontSize: 30, lineHeight: 37, fontFamily: fontFamily.semibold, textAlign: "center" },
  copy: { fontSize: 16, lineHeight: 24, color: colors.muted, textAlign: "center", marginTop: 16 },
  actions: { width: "100%", marginTop: 30, gap: 16 },
  note: { fontSize: 12, lineHeight: 19, color: colors.muted, textAlign: "center" },
  codeBlock: { backgroundColor: colors.paper, padding: 20, borderRadius: 20, alignItems: "center" },
  code: { fontSize: 32, letterSpacing: 5, fontFamily: fontFamily.semibold },
});
