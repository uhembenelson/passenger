import React from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRight } from "lucide-react-native";
import { STATUS_LABELS } from "@passenger/core";
import type { ShipmentStatus } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";

export const colors = {
  bg: semantic.color.background.app,
  paper: semantic.color.background.surface,
  forest: semantic.color.text.primary,
  forestLight: semantic.color.brand.primaryStrong,
  lime: semantic.color.brand.primary,
  text: semantic.color.text.primary,
  muted: semantic.color.text.tertiary,
  border: semantic.color.border.subtle,
  soft: semantic.color.background.subtle,
  amber: semantic.color.text.warning,
  amberBg: semantic.color.background.warningSoft,
  red: semantic.color.text.danger,
  redBg: semantic.color.background.dangerSoft,
  overlay: "rgba(15,35,27,0.48)"
} as const;

export const fontFamily = primitives.typography.family.native;

export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });

export function Txt({ children, style, ...props }: React.ComponentProps<typeof Text>) {
  return <Text {...props} style={[s.text, style]}>{children}</Text>;
}

export function Button({ title, onPress, variant = "primary", busy, disabled, small, style, accessibilityLabel }: { title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "lime"; busy?: boolean; disabled?: boolean; small?: boolean; style?: ViewStyle; accessibilityLabel?: string }) {
  const dark = variant === "primary" || variant === "danger" || variant === "lime";
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [
    s.button,
    small && s.buttonSmall,
    variant === "primary" && s.buttonPrimary,
    variant === "lime" && s.buttonLime,
    variant === "secondary" && s.buttonSecondary,
    variant === "ghost" && s.buttonGhost,
    variant === "danger" && s.buttonDanger,
    (disabled || busy) && s.buttonDisabled,
    pressed && !disabled && s.buttonPressed,
    style,
  ]}>
    {busy ? <ActivityIndicator color={dark ? semantic.color.text.onPrimary : semantic.color.brand.primaryStrong} size="small" /> : <Txt style={[s.buttonText, dark && s.buttonTextOnDark, small && s.buttonTextSmall]}>{title}</Txt>}
  </Pressable>;
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={s.field}><Txt style={s.label}>{label}</Txt><TextInput accessibilityLabel={label} placeholderTextColor={semantic.color.text.tertiary} {...props} style={[s.input, props.multiline && s.inputMultiline, style]} />{hint && <Txt style={s.hint}>{hint}</Txt>}</View>;
}

export function AuthField({ label, hint, style, rightAccessory, onFocus, onBlur, accessibilityLabel, ...props }: TextInputProps & { label?: string; hint?: string; rightAccessory?: React.ReactNode }) {
  const [focused, setFocused] = React.useState(false);
  const resolvedLabel = accessibilityLabel || label || props.placeholder || "Input";
  return <View style={s.authField}>{label ? <Txt style={s.authFieldLabel}>{label}</Txt> : null}<View style={[s.authInputShell, focused && s.authInputShellFocused]}><TextInput accessibilityLabel={resolvedLabel} placeholderTextColor={semantic.color.text.tertiary} selectionColor={colors.lime} cursorColor={colors.lime} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} {...props} style={[s.authInput, rightAccessory ? s.authInputWithAccessory : undefined, props.multiline && s.inputMultiline, style]} />{rightAccessory ? <View style={s.authInputAccessory}>{rightAccessory}</View> : null}</View>{hint && <Txt style={s.hint}>{hint}</Txt>}</View>;
}

export function Badge({ label, tone = "green" }: { label: string; tone?: "green" | "amber" | "red" | "neutral" }) {
  const tint = tone === "green"
    ? { backgroundColor: semantic.color.background.successSoft, color: semantic.color.text.success }
    : tone === "amber"
      ? { backgroundColor: semantic.color.background.warningSoft, color: semantic.color.text.warning }
      : tone === "red"
        ? { backgroundColor: semantic.color.background.dangerSoft, color: semantic.color.text.danger }
        : { backgroundColor: semantic.color.background.subtle, color: semantic.color.text.tertiary };
  return <View style={[s.badge, { backgroundColor: tint.backgroundColor }]}><View style={[s.badgeDot, { backgroundColor: tint.color }]} /><Txt style={[s.badgeText, { color: tint.color }]}>{label}</Txt></View>;
}

export function Status({ status }: { status: ShipmentStatus }) {
  return <Badge label={STATUS_LABELS[status]} tone={status === "disputed" ? "red" : ["pending_review", "matched"].includes(status) ? "amber" : status === "cancelled" ? "neutral" : "green"} />;
}

export function Avatar({ name, size = 38, color = semantic.color.background.successSoft, uri }: { name: string; size?: number; color?: string; uri?: string }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}><Txt style={{ fontSize: size * 0.3, fontFamily: fontFamily.semibold }}>{name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("")}</Txt></View>;
}

export function Card({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function JourneyCardStack({ children }: React.PropsWithChildren) {
  return <View style={s.journeyCardStack}>{children}</View>;
}

export function JourneyRouteCard({ origin, destination, date, time, header, detail, action, children }: React.PropsWithChildren<{
  origin: string;
  destination: string;
  date: string;
  time: string;
  header?: React.ReactNode;
  detail?: React.ReactNode;
  action?: { title: string; onPress: () => void; busy?: boolean };
}>) {
  return <Card style={s.journeyCard}>
    {header}
    <View style={s.journeyRouteRow}>
      <View style={s.journeyRouteEnd}><Txt style={s.journeyRouteLabel}>From</Txt><Txt style={s.journeyCity}>{origin}</Txt></View>
      <View style={s.journeyRouteArrow}><ArrowRight size={components.journeyCard.arrowIconSize} color={components.journeyCard.arrowForeground} strokeWidth={components.journeyCard.arrowStrokeWidth} /></View>
      <View style={[s.journeyRouteEnd, s.journeyRouteEndRight]}><Txt style={s.journeyRouteLabel}>To</Txt><Txt style={s.journeyCity}>{destination}</Txt></View>
    </View>
    <View style={s.journeyDivider} />
    {detail}
    <View style={s.journeyDateRow}><Txt style={s.journeyDateCopy}>{date}</Txt><Txt style={s.journeyDateCopy}>{time}</Txt></View>
    {children}
    {action ? <Button title={action.title} variant="lime" busy={action.busy} onPress={action.onPress} style={s.journeyAction} /> : null}
  </Card>;
}

export function SectionTitle({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <View style={s.sectionTitle}><View style={{ flex: 1 }}><Txt style={s.h2}>{title}</Txt>{subtitle && <Txt style={[s.muted, { marginTop: 5 }]}>{subtitle}</Txt>}</View>{action && onAction && <Button variant="ghost" small title={action + "  ↗"} onPress={onAction} />}</View>;
}

export function Empty({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <Card style={s.emptyCard}><View style={s.emptyIcon}><Txt style={s.emptyIconText}>↗</Txt></View><Txt style={s.h3}>{title}</Txt>{detail ? <Txt style={s.emptyDetail}>{detail}</Txt> : null}{action && onAction && <Button title={action} onPress={onAction} variant="lime" style={s.emptyAction} />}</Card>;
}

export function Notice({ children, tone = "neutral" }: React.PropsWithChildren<{ tone?: "neutral" | "warning" | "error" | "success" }>) {
  const noticeStyle = tone === "error"
    ? { backgroundColor: semantic.color.background.dangerSoft, color: semantic.color.text.danger }
    : tone === "warning"
      ? { backgroundColor: semantic.color.background.warningSoft, color: semantic.color.text.warning }
      : tone === "success"
        ? { backgroundColor: semantic.color.background.successSoft, color: semantic.color.text.success }
        : { backgroundColor: semantic.color.background.subtle, color: semantic.color.brand.primaryStrong };
  return <View accessibilityRole={tone === "error" ? "alert" : "text"} style={[s.notice, { backgroundColor: noticeStyle.backgroundColor }]}><Txt style={[s.noticeText, { color: noticeStyle.color }]}>{children}</Txt></View>;
}

export function Check({ checked, onChange, children }: React.PropsWithChildren<{ checked: boolean; onChange: (checked: boolean) => void }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.checkRow}><View style={[s.checkbox, checked && s.checkboxChecked]}>{checked && <Txt style={s.checkboxMark}>✓</Txt>}</View><Txt style={s.checkText}>{children}</Txt></Pressable>;
}

export function AuthCheckbox({ checked, onChange, children }: React.PropsWithChildren<{ checked: boolean; onChange: (checked: boolean) => void }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.authCheckRow}><View style={[s.authCheckbox, checked && s.authCheckboxChecked]}>{checked && <Txt style={s.authCheckboxMark}>✓</Txt>}</View><Txt style={s.authCheckText}>{children}</Txt></Pressable>;
}

function BottomSheetFrame({ title, eyebrow, onClose, children, titleStyle, bodyStyle, containerStyle }: React.PropsWithChildren<{ title: string; eyebrow?: string; onClose: () => void; titleStyle: StyleProp<TextStyle>; bodyStyle: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle> }>) {
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}><SafeAreaView style={s.presentationOverlay}><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={StyleSheet.absoluteFill} /><View style={[s.presentationSheet, containerStyle]}><View style={s.presentationHandle} /><View style={s.sheetHeader}><View style={{ flex: 1 }}>{eyebrow && <Txt style={s.eyebrow}>{eyebrow}</Txt>}<Txt style={titleStyle}>{title}</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={s.close}><Txt style={s.closeText}>×</Txt></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={bodyStyle}>{children}</ScrollView></View></SafeAreaView></Modal>;
}

export function Sheet({ title, eyebrow, onClose, children, wide = false }: React.PropsWithChildren<{ title: string; eyebrow?: string; onClose: () => void; wide?: boolean }>) {
  return <BottomSheetFrame title={title} eyebrow={eyebrow} onClose={onClose} titleStyle={s.sheetTitle} bodyStyle={s.sheetBody} containerStyle={[s.sheetContainer, wide && s.sheetContainerWide]}>{children}</BottomSheetFrame>;
}

export function PresentationSheet({ title, onClose, children }: React.PropsWithChildren<{ title: string; onClose: () => void }>) {
  return <BottomSheetFrame title={title} onClose={onClose} titleStyle={s.presentationTitle} bodyStyle={s.presentationBody}>{children}</BottomSheetFrame>;
}

export function FullScreenSheet({ title, eyebrow, onClose, children }: React.PropsWithChildren<{ title: string; eyebrow?: string; onClose: () => void }>) {
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={s.fullScreenOverlay}><View style={s.fullScreenSheet}><View style={s.fullScreenHeader}><View style={{ flex: 1 }}>{eyebrow && <Txt style={s.eyebrow}>{eyebrow}</Txt>}<Txt style={s.presentationTitle}>{title}</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={s.close}><Txt style={s.closeText}>×</Txt></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.fullScreenBody}>{children}</ScrollView></View></SafeAreaView></Modal>;
}

export function RouteLine({ origin, destination, compact = false }: { origin: string; destination: string; compact?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: primitives.space[3] }}><Txt style={[s.routeText, compact && s.routeTextCompact]}>{origin}</Txt><View style={{ flex: 1, maxWidth: 75, height: 1, backgroundColor: semantic.color.border.subtle }} /><Txt style={s.routeArrow}>→</Txt><Txt style={[s.routeText, compact && s.routeTextCompact]}>{destination}</Txt></View>;
}

export const shortDate = (timestamp: number) => new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const timeDate = (timestamp: number) => `${shortDate(timestamp)} · ${new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (error as { errors?: { longMessage?: string; message?: string }[] }).errors;
    if (errors?.[0]) return errors[0].longMessage || errors[0].message || "Please check your details and try again.";
  }
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  return message.replace(/\[CONVEX[^\]]*\]\s*/g, "").replace(/\[Request ID:[^\]]*\]\s*/g, "").replace(/Server Error\s*/g, "").split(/\n\s+at |\n\s*Called by client/)[0]!.replace(/^Uncaught Error:\s*/, "");
}

export const s = StyleSheet.create({
  text: { color: colors.text, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  muted: { color: colors.muted, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
  h2: { fontSize: primitives.typography.size.headingH2, lineHeight: primitives.typography.lineHeight.headingH2, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  h3: { fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.regular },
  sheetTitle: { fontSize: primitives.typography.size.headingH1, lineHeight: primitives.typography.lineHeight.headingH1, fontFamily: fontFamily.medium, letterSpacing: -0.6 },
  eyebrow: { color: colors.muted, fontSize: 10, lineHeight: 14, fontFamily: fontFamily.medium, letterSpacing: 1.8, marginBottom: 9, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { minHeight: components.button.height.lg, borderRadius: primitives.radius.pill, paddingHorizontal: 28, paddingVertical: 16, justifyContent: "center", alignItems: "center" },
  buttonSmall: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 10 },
  buttonPrimary: { backgroundColor: semantic.color.text.primary },
  buttonLime: { backgroundColor: semantic.color.brand.primary },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: primitives.borderWidth.sm, borderColor: "#B7E9CB" },
  buttonGhost: { backgroundColor: "transparent" },
  buttonDanger: { backgroundColor: semantic.color.text.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.9 },
  buttonText: { fontSize: primitives.typography.size.button, lineHeight: primitives.typography.lineHeight.button, fontFamily: fontFamily.medium, color: semantic.color.brand.primaryStrong },
  buttonTextOnDark: { color: semantic.color.text.onPrimary },
  buttonTextSmall: { fontSize: primitives.typography.size.button, lineHeight: primitives.typography.lineHeight.button },
  field: { flexGrow: 1, gap: primitives.space[2], marginBottom: 17 },
  label: { fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium, color: colors.text },
  input: { minHeight: components.input.height.lg, borderWidth: components.input.borderWidth, borderColor: semantic.color.border.subtle, borderRadius: components.input.radius, paddingHorizontal: 16, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: colors.text, backgroundColor: semantic.color.background.surface, fontFamily: fontFamily.regular },
  authField: { gap: 12 },
  authFieldLabel: { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.regular, color: colors.text },
  authInputShell: { minHeight: 58, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "transparent", justifyContent: "center" },
  authInputShellFocused: { borderColor: colors.lime },
  authInput: { minHeight: 56, paddingHorizontal: 24, fontSize: 17, lineHeight: 24, color: colors.text, fontFamily: fontFamily.regular },
  authInputWithAccessory: { paddingRight: 56 },
  authInputAccessory: { position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  inputMultiline: { minHeight: 98, textAlignVertical: "top", paddingTop: 14 },
  hint: { fontSize: 11, lineHeight: 17, color: colors.muted, fontFamily: fontFamily.regular },
  badge: { flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: primitives.radius.pill },
  badgeDot: { width: 5, height: 5, borderRadius: 2.5 },
  badgeText: { fontSize: 10, lineHeight: 14, fontFamily: fontFamily.medium },
  card: { backgroundColor: components.card.background, borderRadius: components.card.radius, borderWidth: components.card.borderWidth, borderColor: components.card.borderColor, padding: components.card.padding, shadowColor: components.card.shadowColor, shadowOpacity: components.card.shadowOpacity, shadowRadius: components.card.shadowRadius, shadowOffset: { width: primitives.space[0], height: components.card.shadowOffsetY }, elevation: components.card.elevation },
  journeyCardStack: { gap: components.journeyCard.stackGap },
  journeyCard: { borderWidth: components.journeyCard.borderWidth, borderRadius: components.journeyCard.radius, paddingHorizontal: components.journeyCard.paddingX, paddingVertical: components.journeyCard.paddingY, shadowOpacity: components.journeyCard.shadowOpacity },
  journeyRouteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  journeyRouteEnd: { flex: 1, gap: components.journeyCard.routeEndGap },
  journeyRouteEndRight: { alignItems: "flex-end" },
  journeyRouteLabel: { fontSize: components.journeyCard.routeLabelSize, lineHeight: components.journeyCard.routeLabelLineHeight, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  journeyCity: { fontSize: components.journeyCard.citySize, lineHeight: components.journeyCard.cityLineHeight, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
  journeyRouteArrow: { width: components.journeyCard.arrowSize, height: components.journeyCard.arrowSize, borderRadius: components.journeyCard.arrowRadius, backgroundColor: components.journeyCard.arrowBackground, alignItems: "center", justifyContent: "center" },
  journeyDivider: { height: primitives.borderWidth.sm, backgroundColor: semantic.color.border.subtle, marginTop: components.journeyCard.dividerMarginTop, marginBottom: components.journeyCard.dividerMarginBottom },
  journeyDateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  journeyDateCopy: { fontSize: components.journeyCard.dateSize, lineHeight: components.journeyCard.dateLineHeight, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  journeyAction: { minHeight: components.journeyCard.actionHeight, marginTop: components.journeyCard.actionMarginTop },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: primitives.space[2], marginBottom: 18 },
  emptyCard: { alignItems: "center", padding: primitives.space[8], gap: primitives.space[2] + 2 },
  emptyIcon: { backgroundColor: colors.soft, borderRadius: primitives.radius.xl, width: 56, height: 56, justifyContent: "center", alignItems: "center", marginBottom: 3 },
  emptyIconText: { fontSize: primitives.typography.size.headingH1, lineHeight: primitives.typography.lineHeight.headingH1, fontFamily: fontFamily.medium },
  emptyDetail: { textAlign: "center", maxWidth: 420, lineHeight: 21 },
  emptyAction: { marginTop: primitives.space[2] },
  notice: { padding: 15, borderRadius: primitives.radius.lg, borderWidth: 1, borderColor: semantic.color.border.subtle },
  noticeText: { fontSize: primitives.typography.size.bodyXs, lineHeight: 19, fontFamily: fontFamily.regular },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginVertical: 13 },
  checkbox: { height: 22, width: 22, borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.strong, borderRadius: 5, alignItems: "center", justifyContent: "center", marginTop: 1, backgroundColor: semantic.color.background.surface },
  checkboxChecked: { backgroundColor: semantic.color.text.primary, borderColor: semantic.color.text.primary },
  checkboxMark: { color: semantic.color.text.onPrimary, fontSize: 13, lineHeight: 16, fontFamily: fontFamily.medium },
  checkText: { flex: 1, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  authCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginTop: 2 },
  authCheckbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: colors.text, borderRadius: 8, backgroundColor: semantic.color.background.surface, alignItems: "center", justifyContent: "center" },
  authCheckboxChecked: { backgroundColor: colors.lime, borderColor: colors.lime },
  authCheckboxMark: { color: semantic.color.text.onPrimary, fontSize: 13, lineHeight: 16, fontFamily: fontFamily.semibold },
  authCheckText: { flex: 1, fontSize: 16, lineHeight: 24, fontFamily: fontFamily.regular, color: colors.text },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: primitives.radius["2xl"], backgroundColor: colors.soft },
  closeText: { fontSize: 24, lineHeight: 28, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  presentationOverlay: { flex: 1, backgroundColor: "rgba(15,35,27,0.16)", justifyContent: "flex-end" },
  presentationSheet: { backgroundColor: components.actionSheet.background, borderTopLeftRadius: components.actionSheet.radius, borderTopRightRadius: components.actionSheet.radius, borderWidth: primitives.borderWidth.sm, borderColor: colors.border, borderBottomWidth: primitives.borderWidth.none, overflow: "hidden", maxHeight: components.actionSheet.maxHeight, shadowColor: components.card.shadowColor, shadowOpacity: components.actionSheet.shadowOpacity, shadowRadius: components.actionSheet.shadowRadius, shadowOffset: { width: primitives.space[0], height: components.actionSheet.shadowOffsetY }, elevation: components.actionSheet.elevation },
  fullScreenOverlay: { flex: 1, backgroundColor: components.actionSheet.background },
  fullScreenSheet: { flex: 1, backgroundColor: components.actionSheet.background },
  sheetContainer: { alignSelf: "center", width: "100%", maxWidth: 580 },
  sheetContainerWide: { maxWidth: 780 },
  presentationHandle: { alignSelf: "center", width: components.actionSheet.handleWidth, height: components.actionSheet.handleHeight, borderRadius: components.actionSheet.handleRadius, backgroundColor: colors.border, marginTop: components.actionSheet.handleMarginTop, marginBottom: components.actionSheet.handleMarginBottom },
  sheetHeader: { paddingHorizontal: components.actionSheet.paddingX, paddingBottom: components.actionSheet.headerPaddingBottom, flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  fullScreenHeader: { paddingHorizontal: components.actionSheet.paddingX, paddingTop: primitives.space[2], paddingBottom: components.actionSheet.headerPaddingBottom, flexDirection: "row", alignItems: "center", gap: primitives.space[3], borderBottomWidth: primitives.borderWidth.sm, borderBottomColor: colors.border },
  presentationTitle: { flex: 1, fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.medium, color: colors.text },
  presentationBody: { paddingHorizontal: components.actionSheet.paddingX, paddingBottom: components.actionSheet.bodyPaddingBottom, gap: components.actionSheet.contentGap },
  fullScreenBody: { paddingHorizontal: components.actionSheet.paddingX, paddingTop: primitives.space[4], paddingBottom: components.actionSheet.bodyPaddingBottom, gap: components.actionSheet.contentGap },
  sheetBody: { paddingHorizontal: components.actionSheet.paddingX, paddingBottom: components.actionSheet.bodyPaddingBottom, gap: components.actionSheet.contentGap },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 19 },
  routeText: { fontSize: primitives.typography.size.bodyLg, lineHeight: primitives.typography.lineHeight.bodyLg, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  routeTextCompact: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd },
  routeArrow: { color: semantic.color.text.tertiary, fontSize: 19, lineHeight: 24, fontFamily: fontFamily.regular },
});
