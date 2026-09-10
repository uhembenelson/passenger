import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Bell, Check, Headset, Lock, Search, X } from "lucide-react-native";
import type { Person } from "@passenger/core";
import { isValidPhone } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { usePassenger } from "./data";
import { AuthField, Button, Card, Notice, Txt, colors, s } from "./ui";

type Props = {
  viewer: Person;
  celebrating: boolean;
  navigation: React.ReactNode;
  onCelebrationChange: (open: boolean) => void;
  onFindTravellers: () => void;
  onScheduleTrip: () => void;
  onOpenMilestones: () => void;
  onSafety: () => void;
};

type Flow = "home" | "phone" | "code" | "success";

export function PhoneVerificationHome(props: Props) {
  const { viewer, celebrating, navigation, onCelebrationChange, onFindTravellers, onScheduleTrip, onOpenMilestones, onSafety } = props;
  const data = usePassenger();
  const otpInputRef = useRef<TextInput>(null);
  const [flow, setFlow] = useState<Flow>(celebrating ? "success" : "home");
  const [phone, setPhone] = useState(defaultPhone(viewer.phone));
  const [submittedPhone, setSubmittedPhone] = useState(defaultPhone(viewer.phone));
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<"send" | "verify" | "resend" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (celebrating) setFlow("success");
  }, [celebrating]);

  useEffect(() => {
    if (flow !== "code") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [flow]);

  const resendLabel = formatTimer(Math.max(0, (resendAt ?? 0) - now));
  const canResend = resendAt === null || resendAt <= now;
  const phoneValid = isValidPhone(phone);

  const requestCode = async (kind: "send" | "resend") => {
    setBusy(kind);
    setError("");
    try {
      const trimmedPhone = phone.trim();
      const result = await data.requestPhoneVerification(trimmedPhone);
      setSubmittedPhone(trimmedPhone);
      setCode(result.previewCode ?? "");
      setResendAt(result.resendAt);
      setFlow("code");
      requestAnimationFrame(() => otpInputRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send a verification code.");
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    setBusy("verify");
    setError("");
    try {
      if (code.length !== 6) throw new Error("Enter the 6-digit code.");
      await data.confirmPhoneVerification(code);
      onCelebrationChange(true);
      setFlow("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not verify that code.");
    } finally {
      setBusy(null);
    }
  };

  const closeSuccess = () => {
    onCelebrationChange(false);
    setFlow("home");
  };

  return <View style={v.screen}>
    {flow === "home" ? <>
      <ScrollView contentContainerStyle={v.scroll}>
        {data.offline ? <Notice tone="warning">You're offline. Reconnect before requesting or confirming a verification code.</Notice> : null}
        <View style={v.headerRow}>
          <Txt style={v.greeting}>Hi, {firstName(viewer.name)}</Txt>
          <View style={v.headerIcons}>
            <Pressable accessibilityRole="button" accessibilityLabel="Trust, safety and help" onPress={onSafety}><Headset size={22} color={colors.text} strokeWidth={2.1} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open milestones" onPress={onOpenMilestones}><Bell size={22} color={colors.text} strokeWidth={2.1} /></Pressable>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Find a traveller" onPress={onFindTravellers} style={v.searchShell}>
          <Search size={20} color={colors.muted} strokeWidth={2.1} />
          <Txt style={v.searchCopy}>Find Traveler</Txt>
        </Pressable>

        <Card style={v.lockCard}>
          <View style={v.cardHeader}>
            <View style={v.lockIcon}>
              <Lock size={18} color="#AEB7B9" strokeWidth={2} />
              <View style={v.lockBody} />
            </View>
            <Txt style={v.cardTitle}>Unlock Full Access</Txt>
          </View>
          <Txt style={v.cardBody}>Verify your phone number to request deliveries and schedule trips. It only takes a few seconds!</Txt>
          <Button title="Verify Now" variant="lime" onPress={() => { setPhone(defaultPhone(viewer.phone)); setError(""); setFlow("phone"); }} style={v.cardButton} />
        </Card>
      </ScrollView>

      {navigation}
    </> : null}

    {flow === "phone" ? <VerificationScaffold title="Add Phone Number" onCancel={() => { setError(""); setFlow("home"); }}>
      <Txt style={v.prompt}>Enter your phone number</Txt>
      <AuthField label={undefined} accessibilityLabel="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="08132417465" style={v.singleInputText} />
      {error !== "" ? <Notice tone="error">{error}</Notice> : null}
      <View style={v.ctaSpacer} />
      <Button title="Send OTP" variant="lime" busy={busy === "send" || busy === "resend"} disabled={!phoneValid || !!busy} onPress={() => void requestCode("send")} style={v.bottomButton} />
    </VerificationScaffold> : null}

    {flow === "code" ? <VerificationScaffold title="Verify Phone Number" onCancel={() => { setError(""); setFlow("home"); }}>
      <Txt style={v.prompt}>A 6-digit code was sent to {submittedPhone} via SMS. Enter code</Txt>
      <Pressable accessibilityRole="button" onPress={() => otpInputRef.current?.focus()} style={v.codeRow}>
        {Array.from({ length: 6 }, (_, index) => <View key={index} style={v.codeBox}><Txt style={v.codeDigit}>{code[index] ?? ""}</Txt></View>)}
        <TextInput ref={otpInputRef} value={code} onChangeText={value => { setCode(value.replace(/\D/g, "").slice(0, 6)); setError(""); }} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} style={v.hiddenOtpInput} />
      </Pressable>
      <View style={v.codeMetaRow}>
        <Txt style={v.timer}>{canResend ? "0:00" : resendLabel}</Txt>
        <Pressable accessibilityRole="button" disabled={!canResend} onPress={() => void requestCode("resend")}>
          <Txt style={[v.resend, !canResend && v.resendDisabled]}>Resend code</Txt>
        </Pressable>
      </View>
      {error !== "" ? <Notice tone="error">{error}</Notice> : null}
      <View style={v.ctaSpacer} />
      <Button title="Verify" variant="lime" busy={busy === "verify"} disabled={code.length !== 6 || !!busy} onPress={() => void verifyCode()} style={v.bottomButton} />
    </VerificationScaffold> : null}

    <Modal transparent visible={flow === "success"} animationType="fade" onRequestClose={closeSuccess}>
      <View style={v.sheetOverlay}>
        <Pressable style={v.sheetBackdrop} onPress={closeSuccess} />
        <Card style={v.sheetCard}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close verification success" onPress={closeSuccess} style={v.sheetClose}><X size={26} color={colors.text} strokeWidth={2.1} /></Pressable>
          <View style={v.sheetSuccessIcon}><Check size={28} color={semantic.color.text.onPrimary} strokeWidth={3.2} /></View>
          <Txt style={v.sheetTitle}>Your phone{"\n"}number is verified!</Txt>
          <Button title="Find Travelers" variant="lime" onPress={() => { closeSuccess(); onFindTravellers(); }} style={v.sheetPrimary} />
          <Button title="Schedule a Trip" variant="secondary" onPress={() => { closeSuccess(); onScheduleTrip(); }} style={v.sheetSecondary} />
        </Card>
      </View>
    </Modal>
  </View>;
}

function VerificationScaffold({ title, onCancel, children }: React.PropsWithChildren<{ title: string; onCancel: () => void }>) {
  return <View style={v.flowScreen}>
    <View style={v.flowHeader}>
      <Pressable accessibilityRole="button" onPress={onCancel}><Txt style={v.cancelText}>Cancel</Txt></Pressable>
      <Txt style={v.flowTitle}>{title}</Txt>
      <View style={v.flowSpacer} />
    </View>
    <View style={v.flowBody}>{children}</View>
  </View>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function defaultPhone(phone: string) {
  return phone === "+00000000000" ? "" : phone;
}

function formatTimer(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const v = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 15, paddingTop: 20, paddingBottom: primitives.space[8] },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  greeting: { fontSize: 16, lineHeight: 22, fontFamily: "WorkSansRegular", color: colors.text },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: 20 },
  searchShell: { minHeight: 55, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 0, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  searchCopy: { fontSize: 16, lineHeight: 22, color: semantic.color.text.tertiary, fontFamily: "WorkSansRegular" },
  lockCard: { marginTop: 26, borderRadius: 14, borderWidth: 0, borderColor: "transparent", paddingHorizontal: 15, paddingTop: 20, paddingBottom: 20, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  lockIcon: { width: 18, height: 20, justifyContent: "flex-start", alignItems: "center" },
  lockBody: { position: "absolute", left: 1, right: 1, bottom: 0, height: 11, borderRadius: 3, backgroundColor: "#F3A62F" },
  cardTitle: { fontSize: 16, lineHeight: 22, color: colors.text, fontFamily: "WorkSansSemiBold" },
  cardBody: { marginTop: 16, fontSize: 15, lineHeight: 22, color: colors.text, fontFamily: "WorkSansRegular" },
  cardButton: { marginTop: 26, minHeight: 44 },
  flowScreen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 17, paddingTop: 20, paddingBottom: 28 },
  flowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cancelText: { fontSize: 14, lineHeight: 20, color: colors.text, fontFamily: "WorkSansSemiBold" },
  flowTitle: { fontSize: 17, lineHeight: 23, color: colors.text, fontFamily: "WorkSansSemiBold", textAlign: "center" },
  flowSpacer: { width: 50 },
  flowBody: { flex: 1, marginTop: 38 },
  prompt: { fontSize: 16, lineHeight: 23, color: colors.text, fontFamily: "WorkSansRegular", marginBottom: 15 },
  singleInputText: { fontSize: 17, lineHeight: 24, minHeight: 50 },
  ctaSpacer: { flex: 1 },
  bottomButton: { minHeight: 52 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 27, position: "relative" },
  codeBox: { width: 49, height: 50, borderRadius: 5, backgroundColor: colors.paper, borderWidth: components.input.borderWidth, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  codeDigit: { fontSize: 18, lineHeight: 24, color: colors.text, fontFamily: "WorkSansMedium" },
  hiddenOtpInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  codeMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: primitives.space[6] },
  timer: { fontSize: 15, lineHeight: 21, color: colors.text, fontFamily: "WorkSansRegular" },
  resend: { fontSize: 15, lineHeight: 21, color: colors.text, fontFamily: "WorkSansSemiBold" },
  resendDisabled: { opacity: primitives.opacity.disabled },
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(17,24,39,0.56)" },
  sheetCard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 0, backgroundColor: colors.bg, paddingTop: 46, paddingBottom: 18, paddingHorizontal: 30 },
  sheetClose: { position: "absolute", right: 14, top: 14, zIndex: 1, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  sheetSuccessIcon: { alignSelf: "center", width: 51, height: 51, borderRadius: 26, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center" },
  sheetTitle: { textAlign: "center", marginTop: 22, fontSize: 20, lineHeight: 24, color: colors.text, fontFamily: "WorkSansSemiBold" },
  sheetPrimary: { marginTop: 58, minHeight: 44 },
  sheetSecondary: { marginTop: 16, minHeight: 44 },
});
