import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { Person } from "@passenger/core";
import { IdentityVerification } from "./identity-verification";
import { IdentityNumberVerification } from "./identity-number-verification";
import { Button, colors, fontFamily, PresentationSheet, Txt } from "./ui";

export function IdentityVerificationCard({ viewer }: { viewer: Person }) {
  const [open, setOpen] = useState(false);
  const status = viewer.identityVerificationStatus ?? (viewer.verification === "required" ? "unverified" : viewer.verification);
  const pending = status === "pending";
  const rejected = status === "rejected";
  const numberRequired = !viewer.identityNumberVerifiedAt;
  const faceRequired = viewer.identityFaceVerificationStatus === "required";
  const action = pending ? "View review status" : numberRequired ? "Verify with BVN or NIN" : faceRequired ? "Take live photo" : rejected ? "Update my application" : status === "draft" ? "Continue verification" : "Start verification";
  const title = numberRequired ? "Identity verification required" : faceRequired ? "Live photo required" : pending ? "Verification under review" : rejected ? "Verification needs changes" : status === "draft" ? "Continue account verification" : "Account verification required";
  const body = pending ? "We’ll notify you when compliance completes the review." : rejected ? "Update the information requested by compliance to continue." : numberRequired ? "Use your BVN or NIN to verify your identity." : faceRequired ? "Take a live photo to confirm your identity matches your BVN or NIN." : "Complete verification to send parcels, share trips and receive payouts.";
  const close = () => setOpen(false);
  return <>
    <VerificationSummaryCard title={title} body={body} accessibilityLabel={action} onPress={() => setOpen(true)}>
      {rejected && (viewer.lastVerificationReviewNote ?? viewer.identityNote) ? <Txt style={styles.reviewNote}>{viewer.lastVerificationReviewNote ?? viewer.identityNote}</Txt> : null}
    </VerificationSummaryCard>
    {open && (pending ? <PresentationSheet title="Identity review in progress" onClose={close} footer={<Button title="Back to form" onPress={close} />}>
      <Txt>Your identity document has been submitted. You can publish parcels and trips once the review is approved.</Txt>
      {!!(viewer.lastVerificationReviewNote ?? viewer.identityNote) && <Txt style={styles.body}>{viewer.lastVerificationReviewNote ?? viewer.identityNote}</Txt>}
    </PresentationSheet> : numberRequired ? <IdentityNumberVerification viewer={viewer} onClose={close} /> : <IdentityVerification viewer={viewer} onClose={close} onSuccess={close} />)}
  </>;
}

export function VerificationSummaryCard({ title, body, accessibilityLabel, onPress, children }: React.PropsWithChildren<{ title: string; body: string; accessibilityLabel: string; onPress: () => void }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}>
    <View style={styles.copy}><Txt style={styles.title}>{title}</Txt><Txt style={styles.body}>{body}</Txt>{children}</View>
    <ChevronRight size={22} color="#47634F" />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginTop: 20, borderRadius: 16, backgroundColor: "#EAF7EF", borderWidth: 1, borderColor: "#CBEAD5" },
  copy: { flex: 1, gap: 5 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20, color: "#1F2937" },
  body: { fontSize: 14, lineHeight: 21, color: colors.muted },
  reviewNote: { padding: 10, borderRadius: 12, backgroundColor: "#FFF7E6", color: "#92400E", fontSize: 12, lineHeight: 18 },
});
