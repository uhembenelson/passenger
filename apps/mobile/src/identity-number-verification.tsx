import React, { useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Check, ChevronRight, ShieldCheck, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IdentityNumberType, Person } from "@passenger/core";
import { usePassenger } from "./data";
import { BackButton, Button, Notice, Txt, colors, errorMessage, fontFamily } from "./ui";

export function IdentityNumberVerification({ viewer, onClose, onSuccess }: { viewer: Person; onClose: () => void; onSuccess?: () => void }) {
  const data = usePassenger();
  const inputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const [type, setType] = useState<IdentityNumberType | null>(null);
  const [identityNumber, setIdentityNumber] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [otp, setOtp] = useState("");
  const [providerMessage, setProviderMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  const choose = (next: IdentityNumberType) => {
    setType(next);
    setIdentityNumber("");
    setIdentityId("");
    setOtp("");
    setProviderMessage("");
    setError("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const initiate = async () => {
    if (!type || !/^\d{11}$/.test(identityNumber)) return;
    setBusy(true);
    setError("");
    try {
      const result = await data.initiateIdentityNumberVerification({ type, identityNumber });
      setIdentityId(result.identityId);
      setProviderMessage(result.message);
      setOtp("");
      requestAnimationFrame(() => otpInputRef.current?.focus());
    } catch (cause) {
      setError(errorMessage(cause, `We could not verify that ${type}.`));
    } finally {
      setBusy(false);
    }
  };
  const verifyOtp = async () => {
    if (!type || !identityId || otp.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      await data.verifyIdentityNumberOtp({ type, identityId, otp });
      Keyboard.dismiss();
      setVerified(true);
    } catch (cause) {
      setError(errorMessage(cause, "We could not verify that code."));
    } finally {
      setBusy(false);
    }
  };
  const goBack = () => {
    setError("");
    if (identityId) {
      setIdentityId("");
      setOtp("");
      setProviderMessage("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (type) {
      setType(null);
      setIdentityNumber("");
    } else {
      onClose();
    }
  };
  const finish = () => {
    setVerified(false);
    onSuccess?.();
    onClose();
  };

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => !busy && onClose()}>
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <BackButton accessibilityLabel={identityId ? `Back to ${type} number` : type ? "Choose another verification method" : "Back"} disabled={busy} onPress={goBack} />
            <Txt numberOfLines={2} style={styles.title}>{type ? `Verify ${type}` : "Verify your identity"}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="Close verification" disabled={busy} onPress={onClose} style={styles.headerAction}><X size={22} color={busy ? colors.muted : colors.text} /></Pressable>
          </View>

          {type ? <>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.form}>
              {identityId ? <>
                <View style={styles.infoRow}><ShieldCheck size={20} color="#177A4B" /><Txt style={styles.infoText}>{providerMessage || `Enter the OTP sent for this ${type}.`}</Txt></View>
                <Txt style={styles.label}>Enter verification code</Txt>
                <TextInput ref={otpInputRef} accessibilityLabel="Verification code" value={otp} onChangeText={(value) => { setOtp(value.replace(/\D/g, "").slice(0, 6)); setError(""); }} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} placeholder="6-digit code" placeholderTextColor="#9CA3AF" style={[styles.input, styles.otpInput]} />
              </> : <>
                <View style={styles.infoRow}><ShieldCheck size={20} color="#177A4B" /><Txt style={styles.infoText}>Your {type} is sent securely to the verification provider and is not stored by Passenger.</Txt></View>
                <Txt style={styles.label}>Enter your 11-digit {type}</Txt>
                <TextInput ref={inputRef} accessibilityLabel={`${type} number`} value={identityNumber} onChangeText={(value) => { setIdentityNumber(value.replace(/\D/g, "").slice(0, 11)); setError(""); }} keyboardType="number-pad" autoComplete="off" placeholder={`Enter ${type}`} placeholderTextColor="#9CA3AF" style={styles.input} />
              </>}
              {error ? <Notice tone="error">{error}</Notice> : null}
            </ScrollView>
            <View style={styles.footer}><Button title={identityId ? "Verify code" : "Continue"} variant="lime" busy={busy} disabled={busy || data.offline || (identityId ? otp.length !== 6 : identityNumber.length !== 11)} onPress={() => void (identityId ? verifyOtp() : initiate())} style={styles.button} /></View>
          </> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.choiceBody}>
            <Txt style={styles.intro}>Choose either BVN or NIN. You only need to verify one.</Txt>
            <MethodCard title="Bank Verification Number" abbreviation="BVN" onPress={() => choose("BVN")} />
            <MethodCard title="National Identification Number" abbreviation="NIN" onPress={() => choose("NIN")} />
            <Txt style={styles.privacy}>Passenger stores the verification result and last four digits, not your complete identity number.</Txt>
          </ScrollView>}
      </KeyboardAvoidingView>
    <Modal transparent visible={verified} animationType="fade" onRequestClose={finish}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close confirmation" onPress={finish} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={["bottom"]} style={styles.successSheet}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close confirmation" onPress={finish} style={styles.close}><X size={28} color={colors.text} /></Pressable>
          <View style={styles.check}><Check size={42} color="white" strokeWidth={3} /></View>
          <Txt style={styles.successTitle}>Identity verified</Txt>
          <Txt style={styles.successBody}>Your {type} was verified successfully. You can continue your account verification.</Txt>
          <Button title="Continue" variant="lime" onPress={finish} style={styles.button} />
        </SafeAreaView>
      </View>
    </Modal>
    </SafeAreaView>
  </Modal>;
}

function MethodCard({ title, abbreviation, onPress }: { title: string; abbreviation: IdentityNumberType; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Verify with ${abbreviation}`} onPress={onPress} style={({ pressed }) => [styles.method, pressed && { opacity: 0.75 }]}>
    <View style={styles.methodBadge}><Txt style={styles.methodBadgeText}>{abbreviation}</Txt></View>
    <View style={styles.methodCopy}><Txt style={styles.methodTitle}>{abbreviation}</Txt><Txt style={styles.methodBody}>{title}</Txt></View>
    <ChevronRight size={22} color="#47634F" />
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 48, marginTop: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20, color: colors.text },
  choiceBody: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 28, paddingBottom: 24, gap: 16 },
  intro: { fontSize: 16, lineHeight: 24, color: colors.muted, marginBottom: 8 },
  method: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, padding: 16 },
  methodBadge: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#DDF7E8", alignItems: "center", justifyContent: "center" },
  methodBadgeText: { fontFamily: fontFamily.semibold, color: "#177A4B", fontSize: 14 },
  methodCopy: { flex: 1, gap: 3 },
  methodTitle: { fontFamily: fontFamily.semibold, fontSize: 17, color: colors.text },
  methodBody: { fontSize: 14, lineHeight: 20, color: colors.muted },
  privacy: { marginTop: 8, fontSize: 13, lineHeight: 20, color: colors.muted },
  form: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 28, paddingBottom: 24, gap: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EAF7EF", borderRadius: 14, padding: 14 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#31583E" },
  label: { marginTop: 12, fontFamily: fontFamily.semibold, fontSize: 16, color: colors.text },
  input: { minHeight: 62, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, fontFamily: fontFamily.regular, fontSize: 18, color: colors.text },
  otpInput: { letterSpacing: 8, textAlign: "center", fontFamily: fontFamily.semibold, fontSize: 22 },
  footer: { paddingHorizontal: 18, paddingVertical: 16, backgroundColor: colors.bg },
  button: { width: "100%", minHeight: 54 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(18,18,22,0.62)" },
  successSheet: { minHeight: 360, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg, paddingHorizontal: 28, paddingTop: 50, paddingBottom: 22, alignItems: "center", gap: 18 },
  close: { position: "absolute", right: 18, top: 16, padding: 6 },
  check: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center" },
  successTitle: { fontFamily: fontFamily.semibold, fontSize: 25, color: colors.text },
  successBody: { textAlign: "center", fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: 8 },
});
