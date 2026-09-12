import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronRight, FileText, X } from "lucide-react-native";
import type { DocumentType, Person } from "@passenger/core";
import { usePassenger } from "./data";
import { EvidenceGallery, EvidencePicker, getPendingEvidenceResumeKey } from "./evidence";
import { BackButton, Button, colors, errorMessage, fontFamily, Notice, PresentationSheet, Txt } from "./ui";

import { BrandIllustration } from "./illustrations";

type Screen = "intro" | "document" | "upload" | "review" | "success" | "failure";
const documents: { value: DocumentType; label: string; hint: string }[] = [
  { value: "national_id", label: "National ID", hint: "Include both sides if your details are on the back." },
  { value: "passport", label: "Passport", hint: "Use the page with your photo and personal details." },
  { value: "drivers_license", label: "Driver's licence", hint: "Include both sides if your details are on the back." },
];

export function IdentityVerification({ viewer, onClose, onSuccess }: {
  viewer: Person;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const data = usePassenger();
  const [screen, setScreen] = useState<Screen>("intro");
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const document = documents.find(item => item.value === documentType);
  const locked = busy || uploading;

  useEffect(() => {
    let active = true;
    void getPendingEvidenceResumeKey().then(key => {
      if (active && key === "tier2-identity") setScreen("upload");
    });
    return () => { active = false; };
  }, []);

  const back = () => {
    if (locked) return;
    if (screen === "success") onSuccess();
    else if (screen === "review" || screen === "failure") setScreen("upload");
    else if (screen === "upload") setScreen("document");
    else onClose();
  };
  const submit = async () => {
    if (submitting.current || !documentType || !evidenceIds.length || data.offline) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await data.submitIdentity({ name: viewer.name, phone: viewer.phone, documentType, evidenceIds });
      setScreen("success");
    } catch (cause) {
      setError(errorMessage(cause));
      setScreen("failure");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (screen === "intro") return <PresentationSheet title="Verify your identity" onClose={onClose}>
    <View style={styles.stack}>
      <BrandIllustration name="identityVerification" size={156} style={{ alignSelf: "center" }} />
      <Txt style={styles.body}>Help us keep deliveries in trusted hands. Verify your identity to book deliveries and publish trips.</Txt>
      <Txt style={styles.body}>Have your national ID, passport or driver's licence ready. You'll upload a clear copy for our team to review.</Txt>
      <Txt style={styles.hint}>Your document is private. Only you and authorised Passenger reviewers can access it.</Txt>
      <Button title="Get started" variant="lime" onPress={() => setScreen("document")} />
    </View>
  </PresentationSheet>;

  const result = screen === "success" || screen === "failure";
  const title = screen === "document" ? "Which ID will you use?" : screen === "upload" ? "Add your document" : screen === "review" ? "Ready to send?" : screen === "success" ? "Submitted for review" : "We couldn't submit your ID";
  const description = screen === "document" ? "Choose a document that shows your name and photo." : screen === "upload" ? document?.hint ?? "Upload your ID, then choose its document type to continue." : screen === "review" ? "Make sure your name, photo and document details are easy to read." : screen === "success" ? "Our team will review your document. You can check your verification status in your profile." : "Your attachments are still here. Review them or try sending again.";

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={back}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        {!result ? <BackButton accessibilityLabel="Back" disabled={locked} onPress={back} /> : <View style={styles.headerButton} />}
        <Txt style={styles.headerLabel}>Identity verification</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Close identity verification" disabled={locked} onPress={screen === "success" ? onSuccess : onClose} style={styles.headerButton}><X size={22} color={locked ? colors.muted : colors.text} /></Pressable>
      </View>
      <ScrollView key={screen} contentContainerStyle={[styles.content, result && styles.result]}>
        {result && <View style={styles.icon}>{screen === "success" ? <Check size={36} color={colors.text} /> : <FileText size={36} color={colors.text} />}</View>}
        <View style={styles.stack}>
          <Txt accessibilityRole="header" style={styles.title}>{title}</Txt>
          <Txt style={styles.body}>{description}</Txt>
        </View>
        {screen === "document" && <View style={styles.stack}>{documents.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: documentType === item.value }} onPress={() => setDocumentType(item.value)} style={[styles.option, documentType === item.value && styles.selected]}>
          <FileText size={23} color={colors.text} /><Txt style={styles.optionLabel}>{item.label}</Txt>{documentType === item.value ? <Check size={22} color={colors.text} /> : <ChevronRight size={22} color={colors.muted} />}
        </Pressable>)}</View>}
        {screen === "upload" && <>
          <Txt style={styles.hint}>Show all edges. Avoid glare, blur or covering any details.</Txt>
          <EvidencePicker purpose="identity" value={evidenceIds} onChange={setEvidenceIds} onBusyChange={setUploading} compact resumeKey="tier2-identity" />
        </>}
        {screen === "review" && <>
          <View style={styles.summary}><Txt style={styles.hint}>Document type</Txt><Txt style={styles.optionLabel}>{document?.label}</Txt><Button title="Change document type" small variant="ghost" disabled={busy} onPress={() => setScreen("document")} /></View>
          <EvidenceGallery ids={evidenceIds} />
          <Button title="Edit attachments" variant="ghost" onPress={() => setScreen("upload")} disabled={busy} />
          <Txt style={styles.hint}>Only you and authorised Passenger reviewers can access your document. Submitting it starts a review and does not verify your account immediately.</Txt>
        </>}
        {screen === "failure" && <Notice tone="error">{error}</Notice>}
        {data.offline && !result && <Notice tone="warning">You're offline. Reconnect to upload or submit your document.</Notice>}
      </ScrollView>
      <View style={styles.footer}>
        {screen === "document" && <Button title="Continue" variant="lime" disabled={!documentType} onPress={() => setScreen("upload")} />}
        {screen === "upload" && <Button title={uploading ? "Uploading document" : documentType ? "Review document" : "Choose document type"} variant="lime" disabled={uploading || !evidenceIds.length} onPress={() => setScreen(documentType ? "review" : "document")} />}
        {screen === "review" && <Button title="Submit for review" variant="lime" busy={busy} disabled={data.offline} onPress={() => void submit()} />}
        {screen === "success" && <Button title="Done" variant="lime" onPress={onSuccess} />}
        {screen === "failure" && <><Button title="Try again" variant="lime" disabled={data.offline} busy={busy} onPress={() => void submit()} /><Button title="Review document" variant="ghost" disabled={busy} onPress={() => setScreen("review")} />{data.offline && <Txt style={styles.hint}>Reconnect to try again.</Txt>}</>}
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  headerLabel: { fontFamily: fontFamily.medium, color: colors.muted, fontSize: 14 },
  content: { flexGrow: 1, width: "100%", maxWidth: 560, alignSelf: "center", padding: 24, gap: 28 },
  result: { justifyContent: "center", paddingBottom: 48 },
  stack: { gap: 16 },
  title: { fontFamily: fontFamily.medium, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  body: { fontSize: 16, lineHeight: 25, color: colors.muted },
  hint: { fontSize: 14, lineHeight: 21, color: colors.muted },
  icon: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  option: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 80, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.soft, borderColor: colors.text },
  optionLabel: { flex: 1, fontSize: 17, lineHeight: 24, fontFamily: fontFamily.medium },
  summary: { gap: 8, padding: 20, borderRadius: 20, backgroundColor: colors.soft },
  footer: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 24, gap: 8 },
});
