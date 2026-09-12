import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuthActions } from "@convex-dev/auth/react";
import type { TokenStorage } from "@convex-dev/auth/react";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton, AuthCheckbox, AuthField, Button, colors, errorMessage, Txt } from "./ui";

const HORIZONTAL_PADDING = 18;
const AUTH_MAX_WIDTH = 560;
const AUTH_REQUEST_TIMEOUT_MS = 12000;
const PASSWORD_REQUIREMENTS_COPY = "Use at least 10 characters with uppercase, lowercase, and a number.";
let nextAuthMode: "signIn" | "signUp" = "signUp";

export function openAuthSignInScreen() {
  nextAuthMode = "signIn";
}
const PRIVACY_POLICY_SECTIONS = [
  {
    title: "1. Account details you share",
    body: "When you create a Passenger account, we collect your email address, password, and any contact information you later add to your profile.",
  },
  {
    title: "2. How Passenger uses your information",
    body: "We use your information to create your account, authenticate sign-in, support parcel and trip activity, communicate important service updates, and keep the marketplace safe and functional.",
  },
  {
    title: "3. Verification and trust review",
    body: "Passenger may use profile information, submitted identity details, and delivery activity to review accounts for verification, investigate disputes, and prevent abuse or unsafe activity on the platform.",
  },
  {
    title: "4. Payments and partner services",
    body: "When payment features are enabled, payment processing is handled through configured external providers. Passenger shares only the information required to initialize, verify, and reconcile those transactions.",
  },
  {
    title: "5. Storage and protection",
    body: "Passenger stores account and operational data needed to run the service, maintain delivery records, and support safety workflows. Access is limited to the systems and administrators responsible for operating the platform.",
  },
  {
    title: "6. Your choices",
    body: "You can choose not to create an account, and you can contact the Passenger team if you need help updating account details or understanding how your information is being used within the service.",
  },
] as const;

export const tokenStorage: TokenStorage = {
  async getItem(key) {
    if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async setItem(key, value) {
    if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (Platform.OS === "web") { localStorage.removeItem(key); return; }
    await SecureStore.deleteItemAsync(key);
  },
};

function AuthHeading({ title }: { title: string }) {
  return <Txt accessibilityRole="header" style={a.heading}>{title}</Txt>;
}

function AuthLinkRow({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return <View style={a.linkRow}><Txt style={a.linkPrompt}>{prompt} </Txt><Pressable accessibilityRole="button" onPress={onPress}><Txt style={a.linkAction}>{action}</Txt></Pressable></View>;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function passwordMeetsRequirements(value: string) {
  return value.length >= 10 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

function AuthScaffold({ children, centerContent = true, contentMaxWidth = AUTH_MAX_WIDTH }: React.PropsWithChildren<{ centerContent?: boolean; contentMaxWidth?: number }>) {
  return <SafeAreaView style={a.safe}><KeyboardAvoidingView style={a.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[a.screen, !centerContent && a.screenTopAligned]}><View style={[a.content, { maxWidth: contentMaxWidth }]}>{children}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function PrivacyPolicyScreen({ onBack }: { onBack: () => void }) {
  return <AuthScaffold centerContent={false} contentMaxWidth={680}>
    <View style={a.policyHeader}><View style={a.backButton}><BackButton accessibilityLabel="Go back" onPress={onBack} /></View><View pointerEvents="none"><AuthHeading title="Privacy Policy" /></View></View>
    <View style={a.policyContent}><Txt style={a.policyLead}>Passenger uses your information to create your account, support deliveries, and help keep the marketplace safe. This summary explains the main ways your information is handled inside the app.</Txt>{PRIVACY_POLICY_SECTIONS.map(section => <View key={section.title} style={a.policySection}><Txt style={a.policySectionTitle}>{section.title}</Txt><Txt style={a.policySectionBody}>{section.body}</Txt></View>)}</View>
  </AuthScaffold>;
}

export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">(nextAuthMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [screen, setScreen] = useState<"auth" | "privacy" | "forgot" | "reset" | "verify">("auth");

  const submit = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!validEmail(cleanEmail)) throw new Error("Enter a valid email address.");
      if (password.trim().length === 0) throw new Error("Enter your password.");
      if (mode === "signUp" && !passwordMeetsRequirements(password)) throw new Error(PASSWORD_REQUIREMENTS_COPY);
      if (mode === "signUp" && !acceptedPolicy) throw new Error("Please agree to the privacy policy.");
      const result = await signIn("password", { flow: mode, email: cleanEmail, password });
      if (!result.signingIn) {
        setEmail(cleanEmail);
        setVerificationCode("");
        setNotice(`We sent a verification code to ${cleanEmail}. Check your inbox and spam folder.`);
        setScreen("verify");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "signUp" ? "signIn" : "signUp");
    nextAuthMode = mode === "signUp" ? "signIn" : "signUp";
    setError("");
    setNotice("");
  };

  const startPasswordReset = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!validEmail(cleanEmail)) throw new Error("Enter a valid email address.");
      await Promise.race([
        signIn("password", { flow: "reset", email: cleanEmail }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Sending the reset code is taking too long. Please check your connection and try again.")), AUTH_REQUEST_TIMEOUT_MS)),
      ]);
      setEmail(cleanEmail);
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNotice("We sent a password reset code to your email.");
      setScreen("reset");
      nextAuthMode = "signIn";
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const completePasswordReset = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!validEmail(cleanEmail)) throw new Error("Enter a valid email address.");
      if (!resetCode.trim()) throw new Error("Enter the reset code from your email.");
      if (!passwordMeetsRequirements(newPassword)) throw new Error(PASSWORD_REQUIREMENTS_COPY);
      if (newPassword !== confirmNewPassword) throw new Error("Your new passwords do not match.");
      await Promise.race([
        signIn("password", { flow: "reset-verification", email: cleanEmail, code: resetCode.trim(), newPassword }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Resetting your password is taking too long. Please try again.")), AUTH_REQUEST_TIMEOUT_MS)),
      ]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async (resend = false) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await signIn("password", {
        flow: "email-verification",
        email: email.trim().toLowerCase(),
        ...(resend ? {} : { code: verificationCode.trim() }),
      });
      if (resend) {
        setVerificationCode("");
        setNotice("We sent a new verification code. Use the latest email.");
      } else if (!result.signingIn) {
        throw new Error("We could not verify your email. Request a new code and try again.");
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signUp";
  const passwordValid = passwordMeetsRequirements(password);

  if (screen === "verify") return <AuthScaffold>
    <AuthHeading title="Verify your email" />
    <View style={a.formStack}>
      <Txt style={a.noticeText}>Enter the code sent to {email}. It expires in 10 minutes.</Txt>
      <AuthField label="Verification code" value={verificationCode} onChangeText={setVerificationCode} editable={!busy} autoCapitalize="none" autoCorrect={false} textContentType="oneTimeCode" />
      {!!notice && <Txt style={a.noticeText}>{notice}</Txt>}
      {!!error && <Txt accessibilityRole="alert" style={a.errorText}>{error}</Txt>}
      <Button title="Verify email" onPress={() => void verifyEmail()} busy={busy} disabled={busy || !verificationCode.trim()} variant="lime" style={a.submitButton} />
      <Button title="Send a new code" onPress={() => void verifyEmail(true)} disabled={busy} variant="secondary" />
      <AuthLinkRow prompt="Need another email?" action="Back to log in" onPress={() => { if (busy) return; setScreen("auth"); setMode("signIn"); nextAuthMode = "signIn"; setError(""); setNotice(""); }} />
    </View>
  </AuthScaffold>;
  if (screen === "privacy") return <PrivacyPolicyScreen onBack={() => setScreen("auth")} />;
  if (screen === "forgot") return <AuthScaffold>
    <AuthHeading title="Reset your password" />
    <View style={a.formStack}>
      <AuthField label="Email Address" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
      {!!notice && <Txt style={a.noticeText}>{notice}</Txt>}
      {!!error && <Txt accessibilityRole="alert" style={a.errorText}>{error}</Txt>}
      <Button title="Send reset code" onPress={() => void startPasswordReset()} busy={busy} disabled={busy || !validEmail(email.trim().toLowerCase())} variant="lime" style={a.submitButton} />
      <AuthLinkRow prompt="Remembered your password?" action="Back to log in" onPress={() => { setScreen("auth"); setMode("signIn"); nextAuthMode = "signIn"; setError(""); setNotice(""); }} />
    </View>
  </AuthScaffold>;
  if (screen === "reset") return <AuthScaffold>
    <AuthHeading title="Enter reset code" />
    <View style={a.formStack}>
      <AuthField label="Email Address" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
      <AuthField label="Reset Code" value={resetCode} onChangeText={setResetCode} editable={!busy} autoCapitalize="characters" autoCorrect={false} />
      <AuthField label="New Password" hint={PASSWORD_REQUIREMENTS_COPY} value={newPassword} onChangeText={setNewPassword} editable={!busy} secureTextEntry={!showNewPassword} autoCapitalize="none" autoComplete="new-password" rightAccessory={<Pressable accessibilityRole="button" accessibilityLabel={showNewPassword ? "Hide new password" : "Show new password"} onPress={() => setShowNewPassword(value => !value)} style={a.passwordToggle}>{showNewPassword ? <Eye size={20} color={colors.text} strokeWidth={2} /> : <EyeOff size={20} color={colors.text} strokeWidth={2} />}</Pressable>} />
      <AuthField label="Confirm New Password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} editable={!busy} secureTextEntry={!showNewPassword} autoCapitalize="none" autoComplete="new-password" />
      {!!notice && <Txt style={a.noticeText}>{notice}</Txt>}
      {!!error && <Txt accessibilityRole="alert" style={a.errorText}>{error}</Txt>}
      <Button title="Reset password" onPress={() => void completePasswordReset()} busy={busy} disabled={busy || !resetCode.trim() || !newPassword || !confirmNewPassword} variant="lime" style={a.submitButton} />
      <Button title="Send a new code" onPress={() => void startPasswordReset()} disabled={busy || !validEmail(email.trim().toLowerCase())} variant="secondary" />
      <AuthLinkRow prompt="Need to try logging in again?" action="Back to log in" onPress={() => { setScreen("auth"); setMode("signIn"); nextAuthMode = "signIn"; setError(""); setNotice(""); }} />
    </View>
  </AuthScaffold>;

  return <AuthScaffold>
    <AuthHeading title={isSignup ? "Create an account" : "Log in"} />
    <View style={a.formStack}>
      <AuthField label="Email address" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
      <AuthField label="Password" hint={isSignup ? PASSWORD_REQUIREMENTS_COPY : undefined} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete={isSignup ? "new-password" : "current-password"} rightAccessory={<Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword(value => !value)} style={a.passwordToggle}>{showPassword ? <Eye size={20} color={colors.text} strokeWidth={2} /> : <EyeOff size={20} color={colors.text} strokeWidth={2} />}</Pressable>} />
      {isSignup && <AuthCheckbox checked={acceptedPolicy} onChange={setAcceptedPolicy}><Txt style={a.policyCopy}>I agree to the <Txt style={a.inlinePolicy} onPress={() => setScreen("privacy")}>Privacy Policy</Txt></Txt></AuthCheckbox>}
      {!isSignup && <Pressable accessibilityRole="button" onPress={() => { setScreen("forgot"); setError(""); setNotice(""); }}><Txt style={a.forgotPassword}>Forgot password?</Txt></Pressable>}
      {!!notice && <Txt style={a.noticeText}>{notice}</Txt>}
      {!!error && <Txt accessibilityRole="alert" style={a.errorText}>{error}</Txt>}
      <Button title={isSignup ? "Create account" : "Log in"} onPress={() => void submit()} busy={busy} disabled={busy || (isSignup && (!acceptedPolicy || !passwordValid))} variant="lime" style={a.submitButton} />
      <AuthLinkRow prompt={isSignup ? "Already have an account?" : "Don't have an account?"} action={isSignup ? "Log in" : "Create account"} onPress={toggleMode} />
    </View>
  </AuthScaffold>;
}

const a = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flexGrow: 1, paddingHorizontal: HORIZONTAL_PADDING, paddingTop: 72, paddingBottom: 52, justifyContent: "center" },
  screenTopAligned: { justifyContent: "flex-start", paddingTop: 40 },
  content: { width: "100%", alignSelf: "center" },
  heading: { fontSize: 28, lineHeight: 34, fontFamily: "WorkSansMedium", textAlign: "center", color: colors.text, marginBottom: 42 },
  formStack: { gap: 20 },
  passwordToggle: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  policyCopy: { fontSize: 16, lineHeight: 24, fontFamily: "WorkSansRegular", color: colors.text },
  inlinePolicy: { color: colors.lime, fontFamily: "WorkSansMedium" },
  forgotPassword: { color: colors.lime, fontSize: 14, lineHeight: 20, fontFamily: "WorkSansMedium", textAlign: "right" },
  noticeText: { color: colors.forest, fontSize: 14, lineHeight: 21, textAlign: "center" },
  errorText: { color: colors.red, fontSize: 14, lineHeight: 21, textAlign: "center" },
  submitButton: { marginTop: 4 },
  dividerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#D9DED2" },
  dividerText: { fontSize: 18, lineHeight: 26, fontFamily: "WorkSansRegular", color: colors.text, textAlign: "center" },
  googleButton: { minHeight: 56, borderRadius: 999, borderWidth: 1, borderColor: "#E7EBE0", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 28 },
  googleButtonPressed: { opacity: 0.82 },
  googleButtonDisabled: { opacity: 0.5 },
  googleIcon: { marginRight: 2 },
  googleText: { fontSize: 14, lineHeight: 20, fontFamily: "WorkSansMedium", color: colors.text },
  linkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 6, flexWrap: "wrap" },
  linkPrompt: { fontSize: 14, lineHeight: 20, fontFamily: "WorkSansRegular", color: colors.text },
  linkAction: { fontSize: 14, lineHeight: 20, fontFamily: "WorkSansMedium", color: colors.lime },
  policyHeader: { minHeight: 56, justifyContent: "center", marginBottom: 18 },
  backButton: { position: "absolute", left: 0, top: 0, zIndex: 1 },
  policyContent: { gap: 22 },
  policyLead: { fontSize: 15, lineHeight: 24, color: colors.text, fontFamily: "WorkSansRegular" },
  policySection: { gap: 8 },
  policySectionTitle: { fontSize: 16, lineHeight: 22, color: colors.text, fontFamily: "WorkSansMedium" },
  policySectionBody: { fontSize: 15, lineHeight: 24, color: colors.muted, fontFamily: "WorkSansRegular" },
});
