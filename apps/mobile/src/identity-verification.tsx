import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, ChevronRight, FileText, MapPin, X } from "lucide-react-native";
import type { DocumentType, Person } from "@passenger/core";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { usePassenger } from "./data";
import { EvidenceGallery, EvidencePicker } from "./evidence";
import { BackButton, Button, colors, errorMessage, Field, fontFamily, Notice, Txt } from "./ui";
import { BrandIllustration } from "./illustrations";

type Screen = "intro" | "identity" | "live_photo" | "address" | "proof" | "location" | "review" | "success";
const documents: { value: DocumentType; label: string; hint: string }[] = [
  { value: "national_id", label: "National ID", hint: "Include both sides if details are on the back." },
  { value: "passport", label: "Passport", hint: "Use the page with your photo and personal details." },
  { value: "drivers_license", label: "Driver's licence", hint: "Include both sides if details are on the back." },
];

export function IdentityVerification({ viewer, onClose, onSuccess }: { viewer: Person; onClose: () => void; onSuccess: () => void }) {
  const data = usePassenger();
  const active = useQuery(api.tier1.getMyActiveTier1Submission, {});
  const status = useQuery(api.tier1.getMyVerificationStatus, {});
  const saveIdentity = useMutation(api.tier1.saveTier1IdentityDraft);
  const saveAddress = useMutation(api.tier1.saveTier1AddressDraft);
  const saveProof = useMutation(api.tier1.saveTier1ProofOfAddress);
  const startLocation = useMutation(api.tier1.startAddressVerification);
  const submitLocation = useMutation(api.tier1.submitAddressVerification);
  const assess = useMutation(api.tier1.runSecurityAssessment);
  const submitApplication = useMutation(api.tier1.submitTier1Verification);
  const saveLivePhotoMut = useMutation(api.tier1.saveTier1LiveIdentityPhoto);
  const matchLivePhoto = useAction(api.facereg.processAndMatchFace);
  const [screen, setScreen] = useState<Screen>("intro");
  const names = viewer.name.trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(names[0] ?? "");
  const [middleName, setMiddleName] = useState(names.length > 2 ? names.slice(1, -1).join(" ") : "");
  const [lastName, setLastName] = useState(names.length > 1 ? names[names.length - 1]! : "");
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [identityEvidenceIds, setIdentityEvidenceIds] = useState<string[]>([]);
  const [livePhotoEvidenceId, setLivePhotoEvidenceId] = useState<string | null>(null);
  const [house, setHouse] = useState("");
  const [street, setStreet] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [lga, setLga] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [proofType, setProofType] = useState("Utility bill");
  const [proofAddressText, setProofAddressText] = useState("");
  const [proofEvidenceIds, setProofEvidenceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    if (!active || hydrated.current) return;
    hydrated.current = true;
    if (active.legalName) {
      setFirstName(active.legalName.firstName);
      setMiddleName(active.legalName.middleName ?? "");
      setLastName(active.legalName.lastName);
    }
    setDocumentType(active.identityDocumentType ?? null);
    setDocumentNumber(active.identityDocumentNumber ?? "");
    setIdentityEvidenceIds(active.identityEvidenceIds);
    setLivePhotoEvidenceId(active.liveIdentityEvidenceId ?? null);
    if (active.claimedAddress) {
      setHouse(active.claimedAddress.houseNumberOrName ?? ""); setStreet(active.claimedAddress.street);
      setArea(active.claimedAddress.area ?? ""); setCity(active.claimedAddress.city);
      setLga(active.claimedAddress.lga ?? ""); setState(active.claimedAddress.state);
      setPostalCode(active.claimedAddress.postalCode ?? "");
    }
    setProofType(active.proofOfAddressType ?? "Utility bill");
    setProofAddressText(active.proofAddressText ?? "");
    setProofEvidenceIds(active.proofAddressEvidenceIds);
  }, [active]);

  const locked = busy || uploading;
  const pending = status?.identityStatus === "pending" || active?.status === "pending";
  const currentFlow = ["intro", "identity", ...(status?.faceVerificationStatus === "required" || status?.faceVerificationStatus === "captured" || livePhotoEvidenceId ? ["live_photo"] : []), "address", "proof", "location", "review"] as Screen[];
  const back = () => {
    if (locked) return;
    if (screen === "intro") return onClose();
    if (screen === "success") return onSuccess();
    setError("");
    setScreen(currentFlow[Math.max(0, currentFlow.indexOf(screen) - 1)]!);
  };
  const run = async (operation: () => Promise<void>, next: Screen) => {
    if (locked || data.offline) return;
    setBusy(true); setError("");
    try { await operation(); setScreen(next); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const saveIdentityScreen = () => run(async () => {
    if (!firstName.trim() || !lastName.trim()) throw new Error("Enter your legal first and last name.");
    if (!documentType) throw new Error("Choose the identity document you are using.");
    if (!identityEvidenceIds.length) throw new Error("Upload at least one clear identity document file.");
    await saveIdentity({ legalName: { firstName: firstName.trim(), ...(middleName.trim() ? { middleName: middleName.trim() } : {}), lastName: lastName.trim() }, identityDocumentType: documentType, ...(documentNumber.trim() ? { identityDocumentNumber: documentNumber.trim() } : {}), identityEvidenceIds: identityEvidenceIds.map(id => id as Id<"evidence">) });
  }, currentFlow[currentFlow.indexOf("identity") + 1]!);
  const saveLivePhotoScreen = () => run(async () => {
    if (!livePhotoEvidenceId) throw new Error("Please capture a live photo of yourself.");
    await saveLivePhotoMut({ evidenceId: livePhotoEvidenceId as Id<"evidence"> });
    const result = await matchLivePhoto({ evidenceId: livePhotoEvidenceId as Id<"evidence"> });
    if (!result.isMatch) throw new Error("Your live photo does not match your verified BVN/NIN photo. Please retake it.");
  }, "address");
  const saveAddressScreen = () => run(async () => {
    if (!street.trim() || !city.trim() || !state.trim()) throw new Error("Enter your street, city and state.");
    const raw = [house, street, area, city, lga, state, postalCode, "Nigeria"].map(value => value.trim()).filter(Boolean).join(", ");
    await saveAddress({ claimedAddress: { ...(house.trim() ? { houseNumberOrName: house.trim() } : {}), street: street.trim(), ...(area.trim() ? { area: area.trim() } : {}), city: city.trim(), ...(lga.trim() ? { lga: lga.trim() } : {}), state: state.trim(), ...(postalCode.trim() ? { postalCode: postalCode.trim() } : {}), country: "NG" }, claimedAddressRaw: raw });
  }, "proof");
  const saveProofScreen = () => run(async () => {
    if (!proofType.trim()) throw new Error("Enter the type of proof-of-address document.");
    if (proofAddressText.trim().length < 8) throw new Error("Type the address exactly as it appears on the document.");
    if (!proofEvidenceIds.length) throw new Error("Upload your proof-of-address document.");
    await saveProof({ proofOfAddressType: proofType.trim(), proofAddressText: proofAddressText.trim(), proofAddressEvidenceIds: proofEvidenceIds.map(id => id as Id<"evidence">) });
  }, "location");
  const verifyLocation = () => run(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error("Allow precise location while you are physically at the address you entered.");
    const session = await startLocation({});
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      const reading = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      samples.push({ latitude: reading.coords.latitude, longitude: reading.coords.longitude, accuracyMeters: reading.coords.accuracy ?? 999, clientCapturedAt: reading.timestamp });
    }
    await submitLocation({ sessionId: session.sessionId, token: session.token, samples, deviceSignals: { platform: Platform.OS } });
    await assess({});
  }, "review");
  const submit = () => run(async () => { await submitApplication({}); }, "success");

  if (active === undefined || status === undefined) return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}><SafeAreaView style={styles.screen}><View style={styles.loading}><ActivityIndicator accessibilityLabel="Loading verification" color={colors.text} /></View></SafeAreaView></Modal>;
  const title = pending ? "Verification under review" : screen === "intro" ? "Verify your identity and address" : screen === "identity" ? "Your legal identity" : screen === "address" ? "Your current address" : screen === "proof" ? "Proof of address" : screen === "location" ? "Confirm you are at this address" : screen === "review" ? "Review your application" : "Application submitted";

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={back}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>{!pending && screen !== "success" ? <BackButton accessibilityLabel="Back" disabled={locked} onPress={back} /> : <View style={styles.headerButton} />}<Txt numberOfLines={2} style={styles.headerLabel}>{title}</Txt><Pressable accessibilityRole="button" accessibilityLabel="Close verification" disabled={locked} onPress={pending || screen === "success" ? onSuccess : onClose} style={styles.headerButton}><X size={22} color={locked ? colors.muted : colors.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {pending ? <><BrandIllustration name="identityVerification" size={164} style={styles.art} /><Notice tone="warning">Your complete Tier 1 application is with the compliance team. You cannot publish parcels, trips or accept offers until it is approved.</Notice></>
        : screen === "intro" ? <><BrandIllustration name="identityVerification" size={164} style={styles.art} /><Txt style={styles.body}>Tier 1 verifies your legal identity, current address, proof of address and live presence before a human compliance review.</Txt>{status.identityStatus === "rejected" && <Notice tone="error">{viewer.lastVerificationReviewNote ?? active?.reviewNote ?? "Your previous application needs changes. Update it and submit a new version."}</Notice>}<Notice>Your documents and exact location are private and available only to authorised reviewers.</Notice></>
        : screen === "identity" ? <><Field label="Legal first name" value={firstName} onChangeText={setFirstName} editable={!locked} maxLength={80} /><Field label="Middle name (optional)" value={middleName} onChangeText={setMiddleName} editable={!locked} maxLength={80} /><Field label="Legal last name" value={lastName} onChangeText={setLastName} editable={!locked} maxLength={80} /><View style={styles.stack}>{documents.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: documentType === item.value }} onPress={() => setDocumentType(item.value)} style={[styles.option, documentType === item.value && styles.selected]}><FileText size={22} color={colors.text} /><View style={{ flex: 1 }}><Txt style={styles.optionLabel}>{item.label}</Txt><Txt style={styles.hint}>{item.hint}</Txt></View>{documentType === item.value ? <Check size={21} color={colors.text} /> : <ChevronRight size={21} color={colors.muted} />}</Pressable>)}</View><Field label="Document number (optional)" value={documentNumber} onChangeText={setDocumentNumber} editable={!locked} maxLength={40} /><EvidencePicker purpose="identity" value={identityEvidenceIds} onChange={setIdentityEvidenceIds} disabled={locked} onBusyChange={setUploading} resumeKey="tier1-identity" /></>
        : screen === "live_photo" ? <><Txt style={styles.body}>Take a live photo so we can compare it with your verified BVN/NIN photo.</Txt>{active?.faceMatchStatus === "matched" && <Notice>Your last live photo matched. Continue or retake it if needed.</Notice>}<EvidencePicker cameraOnly purpose="identity" kind="verification_live_photo" value={livePhotoEvidenceId ? [livePhotoEvidenceId] : []} onChange={ids => setLivePhotoEvidenceId(ids[0] ?? null)} disabled={locked} onBusyChange={setUploading} resumeKey="tier1-live-photo" /></>
        : screen === "address" ? <><Txt style={styles.body}>Use the address where you currently live and where you are physically present for the location check.</Txt><Field label="House number or name (optional)" value={house} onChangeText={setHouse} editable={!locked} /><Field label="Street" value={street} onChangeText={setStreet} editable={!locked} /><Field label="Area (optional)" value={area} onChangeText={setArea} editable={!locked} /><Field label="City" value={city} onChangeText={setCity} editable={!locked} /><Field label="Local government area (optional)" value={lga} onChangeText={setLga} editable={!locked} /><Field label="State" value={state} onChangeText={setState} editable={!locked} /><Field label="Postal code (optional)" value={postalCode} onChangeText={setPostalCode} editable={!locked} /></>
        : screen === "proof" ? <><Field label="Document type" value={proofType} onChangeText={setProofType} editable={!locked} placeholder="Utility bill, bank statement…" /><Field label="Address exactly as shown on the document" value={proofAddressText} onChangeText={setProofAddressText} editable={!locked} multiline maxLength={300} /><EvidencePicker purpose="proof_of_address" value={proofEvidenceIds} onChange={setProofEvidenceIds} disabled={locked} onBusyChange={setUploading} resumeKey="tier1-proof-address" /></>
        : screen === "location" ? <><View style={styles.locationIcon}><MapPin size={34} color={colors.forest} /></View><Txt style={styles.body}>Stand at the address you entered, then allow Passenger to collect three precise readings. We compare the stable result with the claimed address; we do not use IP location.</Txt><Notice>Move near a window or outdoors if GPS accuracy is poor. The session expires after a few minutes.</Notice></>
        : screen === "review" ? <><Review title="Identity"><Txt>{[firstName, middleName, lastName].filter(Boolean).join(" ")}</Txt><Txt style={styles.hint}>{documents.find(item => item.value === documentType)?.label} · {identityEvidenceIds.length} file{identityEvidenceIds.length === 1 ? "" : "s"}</Txt></Review>{livePhotoEvidenceId && <Review title="Live photo"><EvidenceGallery ids={[livePhotoEvidenceId]} /></Review>}<Review title="Current address"><Txt>{[house, street, area, city, lga, state, postalCode].filter(Boolean).join(", ")}</Txt></Review><Review title="Proof of address"><Txt>{proofType}</Txt><Txt style={styles.hint}>{proofAddressText}</Txt><EvidenceGallery ids={proofEvidenceIds} /></Review><Notice>The Security Engine provides a review recommendation only. A compliance reviewer makes the final decision.</Notice></>
        : <><View style={styles.successIcon}><Check size={38} color={colors.text} /></View><Txt style={styles.body}>Your Tier 1 application has been submitted. We will notify you after the compliance review.</Txt></>}
        {!!error && <Notice tone="error">{error}</Notice>}{data.offline && !pending && screen !== "success" && <Notice tone="warning">Reconnect before saving or submitting verification.</Notice>}
      </ScrollView>
      <View style={styles.footer}>{pending ? <Button title="Done" variant="lime" onPress={onSuccess} /> : screen === "intro" ? <Button title={status.identityStatus === "rejected" ? "Update my application" : "Begin verification"} variant="lime" onPress={() => setScreen("identity")} /> : screen === "identity" ? <Button title="Save identity" variant="lime" busy={busy} disabled={locked || data.offline} onPress={() => void saveIdentityScreen()} /> : screen === "live_photo" ? <Button title="Check live photo" variant="lime" busy={busy} disabled={locked || data.offline} onPress={() => void saveLivePhotoScreen()} /> : screen === "address" ? <Button title="Save address" variant="lime" busy={busy} disabled={locked || data.offline} onPress={() => void saveAddressScreen()} /> : screen === "proof" ? <Button title="Save proof of address" variant="lime" busy={busy} disabled={locked || data.offline} onPress={() => void saveProofScreen()} /> : screen === "location" ? <Button title="Verify this location" variant="lime" busy={busy} disabled={locked || data.offline} onPress={() => void verifyLocation()} /> : screen === "review" ? <Button title="Submit for compliance review" variant="lime" busy={busy} disabled={locked || data.offline} onPress={() => void submit()} /> : <Button title="Done" variant="lime" onPress={onSuccess} />}</View>
    </SafeAreaView>
  </Modal>;
}

function Review({ title, children }: React.PropsWithChildren<{ title: string }>) { return <View style={styles.review}><Txt style={styles.reviewTitle}>{title}</Txt>{children}</View>; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, minHeight: 60 }, headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, headerLabel: { flex: 1, textAlign: "center", fontFamily: fontFamily.medium, color: colors.text, fontSize: 15, lineHeight: 20 }, content: { flexGrow: 1, width: "100%", maxWidth: 580, alignSelf: "center", padding: 24, gap: 18 }, footer: { width: "100%", maxWidth: 580, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 16 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, art: { alignSelf: "center" }, body: { fontSize: 16, lineHeight: 25, color: colors.muted }, hint: { fontSize: 13, lineHeight: 19, color: colors.muted }, stack: { gap: 10 }, option: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border }, selected: { backgroundColor: colors.soft, borderColor: colors.text }, optionLabel: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22 }, locationIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.soft, alignSelf: "center", alignItems: "center", justifyContent: "center" }, successIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.soft, alignSelf: "center", alignItems: "center", justifyContent: "center" }, review: { padding: 18, borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, gap: 8 }, reviewTitle: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22 },
});
