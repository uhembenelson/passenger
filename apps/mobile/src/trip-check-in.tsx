import React, { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, Phone, ShieldCheck, ShieldAlert } from "lucide-react-native";
import { useMutation } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import type { Shipment } from "@passenger/core";
import { usePassengerState } from "./data";
import { BackButton, Button, colors, errorMessage, fontFamily, Notice, Txt } from "./ui";

type TripHelpProps = { shipment: Shipment; onClose: () => void; onProblem: (category?: string) => void };

/** Help-only entry for senders; never presents the traveller's safety confirmation. */
export function TripHelp(props: TripHelpProps) {
  return <TripCheckIn {...props} helpOnly />;
}

export function TripCheckIn({ shipment, onClose, onProblem, helpOnly = false }: TripHelpProps & { helpOnly?: boolean }) {
  const { offline } = usePassengerState();
  const checkIn = useMutation(api.deliveries.confirmSafe);
  const [help, setHelp] = useState<"choose" | "police" | "medical" | "fire" | null>(helpOnly ? "choose" : null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const back = () => {
    if (busy) return;
    setError("");
    if (help && help !== "choose") setHelp("choose");
    else if (help && !helpOnly) setHelp(null);
    else onClose();
  };
  // Verified 2026-09-12: https://www.gov.uk/foreign-travel-advice/nigeria/getting-help
  // 112 serves police, fire and medical emergencies nationwide; do not infer local lines from a trip destination.
  const callEmergency = async () => {
    setError("");
    try { await Linking.openURL("tel:112"); }
    catch { setError("Dialler unavailable. Call 112 from your phone."); }
  };
  return <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={back}>
    <SafeAreaView style={c.screen}>
      <View style={c.header}><BackButton accessibilityLabel={help ? "Back" : "Back to active trip"} disabled={busy} onPress={back} /></View>
      <ScrollView contentContainerStyle={c.content}>
        {help ? <View style={c.center}>
          <View style={[c.icon, { backgroundColor: colors.amberBg }]}><ShieldAlert size={48} strokeWidth={1.5} color={colors.amber} /></View>
          <Txt accessibilityRole="header" style={c.title}>{help === "choose" ? "What happened?" : "Get emergency help"}</Txt>
          <Txt style={c.copy}>{help === "choose" ? "Immediate danger? Call 112." : help === "police" ? "Move away from danger if safe. Avoid confrontation." : help === "medical" ? "Tell the operator about injuries and where help is needed." : "Move away from fire and smoke if safe."}</Txt>
          <View style={c.actions}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button title={help === "police" ? "Call police · 112" : help === "medical" ? "Call for medical help · 112" : help === "fire" ? "Call fire service · 112" : "Call emergency services · 112"} icon={<Phone size={20} color={colors.paper} />} variant="danger" style={c.primary} onPress={() => void callEmergency()} />
            <Txt style={c.emergencyNote}>Nigeria · Police, fire and medical help.</Txt>
            {help === "choose" ? <>
              <Button title="Threats, violence or robbery" variant="secondary" onPress={() => { setError(""); setHelp("police"); }} />
              <Button title="Crash, injury or medical emergency" variant="secondary" onPress={() => { setError(""); setHelp("medical"); }} />
              <Button title="Fire or smoke" variant="secondary" onPress={() => { setError(""); setHelp("fire"); }} />
              <Button title="A delivery problem · contact support" variant="ghost" small onPress={() => onProblem()} />
            </> : <>
              <Txt style={c.copy}>Give the road or nearest landmark. If calling for someone else, say so and give their last known location.</Txt>
              <Button title="I'm safe enough to contact support" variant="secondary" onPress={() => onProblem("Safety incident")} />
              <Txt style={c.emergencyNote}>Support cannot dispatch emergency responders.</Txt>
            </>}
          </View>
        </View> : <View style={c.center}>
          <View style={c.icon}>{saved ? <Check size={44} color={colors.forest} /> : <ShieldCheck size={48} strokeWidth={1.5} color={colors.forest} />}</View>
          <Txt accessibilityRole="header" style={c.title}>{saved ? "Check-in saved" : "Are you and the parcel safe?"}</Txt>
          {!saved ? <Txt style={c.route}>{shipment.origin} to {shipment.destination}</Txt> : null}
          <View style={c.actions}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {!saved && offline ? <Notice>Reconnect to save your check-in.</Notice> : null}
            {saved ? <Button title="Back to my trip" variant="lime" onPress={onClose} style={c.primary} /> : <>
              <Button title="Yes, we are safe" variant="lime" busy={busy} disabled={offline} style={c.primary} onPress={async () => {
                if (busy || offline) return;
                setBusy(true); setError("");
                try { await checkIn({ shipmentId: shipment.id as Id<"shipments"> }); setSaved(true); }
                catch (cause) { setError(errorMessage(cause)); }
                finally { setBusy(false); }
              }} />
              <Button title="Something went wrong" variant="ghost" small disabled={busy} onPress={() => { setError(""); setHelp("choose"); }} />
            </>}
          </View>
        </View>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const c = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, height: 56, justifyContent: "center" },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28, paddingTop: 24, paddingBottom: 80 },
  center: { width: "100%", maxWidth: 400, alignItems: "center" },
  icon: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#E5EED5", alignItems: "center", justifyContent: "center", marginBottom: 32 },
  route: { fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 16 },
  title: { fontSize: 32, lineHeight: 39, fontFamily: fontFamily.semibold, textAlign: "center", color: colors.forest },
  copy: { fontSize: 16, lineHeight: 25, color: colors.muted, textAlign: "center", marginTop: 16, maxWidth: 310 },
  reference: { fontSize: 11, color: colors.muted, marginTop: 16 },
  actions: { width: "100%", gap: 14, marginTop: 40 },
  emergencyNote: { fontSize: 12, lineHeight: 19, color: colors.muted, textAlign: "center" },
  primary: { minHeight: 58, borderRadius: 18 },
});
