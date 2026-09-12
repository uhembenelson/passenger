import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight } from "lucide-react-native";
import type { Person } from "@passenger/core";
import { BrandIllustration } from "./illustrations";
import { IdentityVerification } from "./identity-verification";
import { PhoneVerificationHome } from "./phone-verification";
import { Button, colors, fontFamily, PresentationSheet, Txt } from "./ui";

export function IdentityVerificationCard({ viewer }: { viewer: Person }) {
  const [open, setOpen] = useState(false);
  const pending = viewer.verification === "pending";
  const rejected = viewer.verification === "rejected";
  const phoneRequired = !viewer.phoneVerificationTime;
  const action = pending ? "View review status" : phoneRequired ? "Verify phone first" : rejected ? "Resubmit identity" : "Verify identity";
  const close = () => setOpen(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={() => setOpen(true)} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}>
      <BrandIllustration name="identityVerification" size={96} style={{ alignSelf: "center" }} />
      <Txt style={styles.title}>{pending ? "Your ID is being reviewed" : rejected ? "Let's update your ID" : "Verify your identity"}</Txt>
      <Txt style={styles.body}>{pending ? "We'll update your profile when the review is complete." : "Verify your identity to publish parcels, share trips and match with other members."}</Txt>
      <View style={styles.action}><Txt style={styles.actionText}>{action}</Txt><ArrowUpRight size={18} color={colors.forest} /></View>
    </Pressable>
    {open && (pending ? <PresentationSheet title="Identity review in progress" onClose={close} footer={<Button title="Back to form" onPress={close} />}>
      <Txt>Your identity document has been submitted. You can publish parcels and trips once the review is approved.</Txt>
      {!!viewer.identityNote && <Txt style={styles.body}>{viewer.identityNote}</Txt>}
    </PresentationSheet> : phoneRequired ? <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Button title="Back to form" variant="ghost" onPress={close} />
        <PhoneVerificationHome viewer={viewer} celebrating={false} navigation={null} onCelebrationChange={() => undefined} onFindTravellers={close} onScheduleTrip={close} onOpenNotifications={close} onSafety={close} />
      </SafeAreaView>
    </Modal> : <IdentityVerification viewer={viewer} onClose={close} onSuccess={close} />)}
  </>;
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 10, marginBottom: 20, borderRadius: 24, backgroundColor: "#EDF3E9", borderWidth: 1, borderColor: "#DDE8D5" },
  title: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 26, color: colors.text },
  body: { fontSize: 14, lineHeight: 21, color: colors.muted },
  action: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  actionText: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 20, color: colors.forest },
});
