import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { MessageCircleMore, MessageSquareText } from "lucide-react-native";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { Notice, PresentationSheet, Txt, s } from "./ui";

export function ReceiverCodeSheet({ receiverPhone, busy, disabled, error, onClose, onShareSms, onShareWhatsApp }: { receiverPhone: string; busy?: "" | "sms" | "whatsapp"; disabled?: boolean; error?: string; onClose: () => void; onShareSms: () => void; onShareWhatsApp: () => void }) {
  return <PresentationSheet title="Share receiver code" onClose={onClose}>
    <View style={r.phoneBlock}>
      <Txt style={s.detailLabel}>Receiver phone</Txt>
      <Txt style={s.h3}>{receiverPhone}</Txt>
    </View>
    <Txt style={[s.muted, r.helperText]}>Share via SMS or WhatsApp.</Txt>
    <View style={r.optionsRow}>
      <ShareIconButton
        label="Share by SMS"
        icon={<MessageSquareText size={components.actionSheet.optionSize} color={semantic.color.brand.primaryStrong} strokeWidth={components.icon.strokeWidth.regular} />}
        busy={busy === "sms"}
        disabled={disabled}
        onPress={onShareSms}
      />
      <ShareIconButton
        label="Share on WhatsApp"
        icon={<MessageCircleMore size={components.actionSheet.optionSize} color={semantic.color.brand.primaryStrong} strokeWidth={components.icon.strokeWidth.regular} />}
        busy={busy === "whatsapp"}
        disabled={disabled}
        onPress={onShareWhatsApp}
      />
    </View>
    {error ? <Notice tone="error">{error}</Notice> : null}
  </PresentationSheet>;
}

function ShareIconButton({ label, icon, busy, disabled, onPress }: { label: string; icon: React.ReactNode; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled || !!busy, busy }}
    disabled={disabled || busy}
    onPress={onPress}
    style={({ pressed }) => [r.optionButton, (disabled || busy) && r.optionButtonDisabled, pressed && !disabled && !busy && r.optionButtonPressed]}
  >
    {busy ? <ActivityIndicator color={semantic.color.brand.primaryStrong} size="small" /> : icon}
  </Pressable>;
}

const r = StyleSheet.create({
  phoneBlock: { gap: primitives.space[1] },
  helperText: { textAlign: "right" },
  optionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: components.actionSheet.optionGap },
  optionButton: {
    width: components.actionSheet.optionSize,
    height: components.actionSheet.optionSize,
    alignItems: "center",
    justifyContent: "center",
  },
  optionButtonDisabled: { opacity: primitives.opacity.disabled },
  optionButtonPressed: { opacity: primitives.opacity.pressed },
});
