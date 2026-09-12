import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { X } from "lucide-react-native";
import { BrandIllustration } from "./illustrations";
import { HomeTripBackground } from "./home-trip-background";
import { BackButton, Button, colors, fontFamily, PresentationSheet, Txt } from "./ui";

type Mode = "sender" | "traveller";

/** Separate introductions for each account and mode, acknowledged only on Continue. */
export function useCreateIntro(mode: Mode, userId: string | undefined, editing: boolean) {
  const [show, setShow] = useState<boolean | null>(editing ? false : null);
  const [replaying, setReplaying] = useState(false);
  const key = `passenger.intro.${mode}.v1.${userId ?? "guest"}`;
  useEffect(() => {
    if (editing) { setShow(false); return; }
    let active = true;
    setShow(null);
    void (async () => {
      try {
        const seen = Platform.OS === "web" ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
        if (active) setShow(seen !== "seen");
      } catch { if (active) setShow(true); }
    })();
    return () => { active = false; };
  }, [key, editing]);
  const dismiss = () => {
    setShow(false);
    setReplaying(false);
    void (async () => {
      try {
        if (Platform.OS === "web") localStorage.setItem(key, "seen");
        else await SecureStore.setItemAsync(key, "seen");
      } catch { /* The form remains available if local storage is unavailable. */ }
    })();
  };
  return { show, dismiss, replaying, replay: () => { setReplaying(true); setShow(true); } };
}

export function CreateIntro({ mode, onContinue, onClose, replaying = false }: { mode: Mode; onContinue: () => void; onClose: () => void; replaying?: boolean }) {
  const sender = mode === "sender";
  return <PresentationSheet title={sender ? "Send it with someone going your way" : "Let your trip help pay for itself"} onClose={onClose} containerStyle={{ width: "100%", maxWidth: 580, alignSelf: "center" }} footer={<Button title={replaying ? sender ? "Back to my parcel" : "Back to my trip" : sender ? "Let's send a parcel" : "Add my trip"} variant="lime" onPress={onContinue} />}>
    <View>
    <View style={styles.introArt}>
      <HomeTripBackground compact />
      <BrandIllustration name={sender ? "createParcel" : "createTrip"} size={156} />
    </View>
    <Txt style={styles.introBody}>{sender
      ? "Passenger connects your parcel with a verified traveller already heading towards its destination."
      : "Passenger helps you offset the cost of your trip by accepting deliveries you can take along with you."}</Txt>
    <View style={styles.explanation}>
      <Txt style={styles.explanationTitle}>{sender ? "Tell us what you're sending" : "Share the trip you're already taking"}</Txt>
      <Txt style={styles.body}>{sender ? "Add parcel details and photos. The delivery fee is held in your wallet during review." : "Share your route and choose parcels that fit your plans."}</Txt>
      <Txt style={styles.explanationTitle}>{sender ? "Choose a traveller, then hand it over" : "Deliver along the way and get paid"}</Txt>
      <Txt style={styles.body}>{sender ? "Choose a traveller. Confirm pickup and delivery with your codes." : "Inspect the parcel at pickup. Get paid after delivery is confirmed."}</Txt>
    </View>
    </View>
  </PresentationSheet>;
}

export function CreateFlowLoading({ onClose }: { onClose: () => void }) {
  return <PresentationSheet title="Getting ready" onClose={onClose}><ActivityIndicator accessibilityLabel="Loading" color={colors.text} /></PresentationSheet>;
}

export function CreateFlowFrame({ title, description, onClose, onBack, locked, footer, children, screenKey }: React.PropsWithChildren<{
  title: string; description: string; onClose: () => void; onBack?: () => void; locked: boolean; footer: React.ReactNode; screenKey: string;
}>) {
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => !locked && (onBack ?? onClose)()}>
    <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <BackButton accessibilityLabel="Back" disabled={locked} onPress={onBack ?? onClose} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close form" disabled={locked} onPress={onClose} style={styles.iconButton}><X size={22} color={colors.text} /></Pressable>
      </View>
      <ScrollView key={screenKey} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Txt accessibilityRole="header" style={styles.title}>{title}</Txt>
        {!!description && <Txt style={styles.description}>{description}</Txt>}
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}

export function ReviewSection({ title, onEdit, disabled, children }: React.PropsWithChildren<{ title: string; onEdit: () => void; disabled: boolean }>) {
  return <View style={styles.review}><View style={styles.reviewHeading}><Txt style={styles.explanationTitle}>{title}</Txt><Button title="Edit" accessibilityLabel={`Edit ${title.toLowerCase()}`} small variant="ghost" disabled={disabled} onPress={onEdit} /></View>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 600, alignSelf: "center", padding: 24 },
  title: { fontFamily: fontFamily.medium, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, marginBottom: 12 },
  description: { fontSize: 16, lineHeight: 24, color: colors.muted, marginBottom: 28 },
  footer: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 16 },
  introArt: { height: 170, backgroundColor: colors.soft, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 20 },
  introBody: { fontSize: 17, lineHeight: 25, marginBottom: 20 },
  explanation: { gap: 8, marginBottom: 24 },
  explanationTitle: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 23 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  review: { backgroundColor: colors.paper, borderRadius: 20, padding: 18, gap: 8, marginBottom: 16 },
  reviewHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
