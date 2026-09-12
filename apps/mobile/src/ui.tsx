import React from "react";
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ArrowRight, ArrowUpRight, Check as CheckIcon, X } from "lucide-react-native";
import { formatErrorMessage, STATUS_LABELS } from "@passenger/core";
import type { ShipmentStatus } from "@passenger/core";
import { components, primitives, semantic } from "@passenger/design-tokens";
import { BrandIllustration } from "./illustrations";
import type { IllustrationName } from "./illustrations";

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

export const typography = {
  textScaleCap: 1.5,
  controlScaleCap: 1.3,
  inputScaleCap: 1.4,
} as const;

export function useDelayedVisibility(visible: boolean, delayMs = 300) {
  const [delayed, setDelayed] = React.useState(false);
  React.useEffect(() => {
    if (!visible) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, visible]);
  return delayed;
}

export function Txt({ children, style, ...props }: React.ComponentProps<typeof Text>) {
  return <Text allowFontScaling maxFontSizeMultiplier={typography.textScaleCap} {...props} style={[s.text, style]}>{children}</Text>;
}

export function ExpandableText({ children, numberOfLines = 2, style }: {
  children: React.ReactNode;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [truncated, setTruncated] = React.useState(false);
  return <View style={s.expandableText}>
    <Txt
      numberOfLines={expanded ? undefined : numberOfLines}
      ellipsizeMode="tail"
      onTextLayout={event => {
        if (!expanded) setTruncated(event.nativeEvent.lines.length > numberOfLines);
      }}
      style={style}
    >{children}</Txt>
    {truncated || expanded ? <Pressable
      accessibilityRole="button"
      accessibilityLabel={expanded ? "Show less text" : "Show full text"}
      hitSlop={8}
      onPress={() => setExpanded(value => !value)}
    ><Txt maxFontSizeMultiplier={typography.controlScaleCap} style={s.expandAction}>{expanded ? "Less" : "More"}</Txt></Pressable> : null}
  </View>;
}

export function BackButton({ onPress, disabled = false, accessibilityLabel = "Back" }: {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    hitSlop={components.iconButton.hitSlop}
    pressRetentionOffset={components.iconButton.pressRetentionOffset}
    onPress={onPress}
    style={({ pressed }) => [s.backButton, pressed && !disabled && s.backButtonPressed, disabled && s.buttonDisabled]}
  ><ChevronLeft size={components.icon.size.lg} color={semantic.color.text.primary} strokeWidth={components.icon.strokeWidth.regular} /></Pressable>;
}

export function Button({ title, onPress, variant = "primary", busy, disabled, small, style, accessibilityLabel, icon }: { title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "lime"; busy?: boolean; disabled?: boolean; small?: boolean; style?: ViewStyle; accessibilityLabel?: string; icon?: React.ReactNode }) {
  const dark = variant === "primary" || variant === "danger" || variant === "lime";
  const showBusy = useDelayedVisibility(!!busy);
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
    {showBusy ? <ActivityIndicator color={dark ? semantic.color.text.onPrimary : semantic.color.brand.primaryStrong} size="small" /> : <>{<Txt maxFontSizeMultiplier={typography.controlScaleCap} numberOfLines={2} ellipsizeMode="tail" style={[s.buttonText, dark && s.buttonTextOnDark, small && s.buttonTextSmall]}>{title}</Txt>}{icon}</>}
  </Pressable>;
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={s.field}><Txt style={s.label}>{label}</Txt><TextInput allowFontScaling maxFontSizeMultiplier={typography.inputScaleCap} accessibilityLabel={label} placeholderTextColor={semantic.color.text.tertiary} {...props} style={[s.input, props.multiline && s.inputMultiline, style]} />{hint && <Txt style={s.hint}>{hint}</Txt>}</View>;
}

export function AuthField({ label, hint, style, rightAccessory, onFocus, onBlur, accessibilityLabel, ...props }: TextInputProps & { label?: string; hint?: string; rightAccessory?: React.ReactNode }) {
  const [focused, setFocused] = React.useState(false);
  const resolvedLabel = accessibilityLabel || label || props.placeholder || "Input";
  return <View style={s.authField}>{label ? <Txt style={s.authFieldLabel}>{label}</Txt> : null}<View style={[s.authInputShell, focused && s.authInputShellFocused]}><TextInput allowFontScaling maxFontSizeMultiplier={typography.inputScaleCap} accessibilityLabel={resolvedLabel} placeholderTextColor={semantic.color.text.tertiary} selectionColor={colors.lime} cursorColor={colors.lime} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} {...props} style={[s.authInput, rightAccessory ? s.authInputWithAccessory : undefined, props.multiline && s.inputMultiline, style]} />{rightAccessory ? <View style={s.authInputAccessory}>{rightAccessory}</View> : null}</View>{hint && <Txt style={s.hint}>{hint}</Txt>}</View>;
}

export function Badge({ label, tone = "green" }: { label: string; tone?: "green" | "amber" | "red" | "neutral" }) {
  const tint = tone === "green"
    ? { backgroundColor: semantic.color.background.successSoft, color: semantic.color.text.success }
    : tone === "amber"
      ? { backgroundColor: semantic.color.background.warningSoft, color: semantic.color.text.warning }
      : tone === "red"
        ? { backgroundColor: semantic.color.background.dangerSoft, color: semantic.color.text.danger }
        : { backgroundColor: semantic.color.background.subtle, color: semantic.color.text.tertiary };
  return <View style={[s.badge, { backgroundColor: tint.backgroundColor }]}><View style={[s.badgeDot, { backgroundColor: tint.color }]} /><Txt numberOfLines={1} ellipsizeMode="tail" style={[s.badgeText, { color: tint.color }]}>{label}</Txt></View>;
}

export function Status({ status }: { status: ShipmentStatus }) {
  return <Badge label={STATUS_LABELS[status]} tone={status === "disputed" ? "red" : ["pending_review", "matched"].includes(status) ? "amber" : status === "cancelled" ? "neutral" : "green"} />;
}

export function Avatar({ name, size = 38, color = semantic.color.background.successSoft, uri }: { name: string; size?: number; color?: string; uri?: string }) {
  if (uri) {
    return <ProgressiveImage uri={uri} accessibilityLabel={`${name}'s profile photo`} placeholderColor={color} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}><Txt style={{ fontSize: size * 0.3, fontFamily: fontFamily.semibold }}>{name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("")}</Txt></View>;
}

export function ProgressiveImage({ uri, accessibilityLabel, placeholderColor = semantic.color.background.subtle, style, resizeMode = "cover" }: {
  uri: string;
  accessibilityLabel: string;
  placeholderColor?: string;
  style: StyleProp<ViewStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  return <View style={[style, { overflow: "hidden", backgroundColor: placeholderColor }]}>
    <Animated.Image
      source={{ uri }}
      accessibilityLabel={accessibilityLabel}
      resizeMode={resizeMode}
      onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()}
      style={[StyleSheet.absoluteFill, { width: undefined, height: undefined, opacity }]}
    />
  </View>;
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
      <View style={s.journeyRouteEnd}><Txt style={s.journeyRouteLabel}>From</Txt><Txt numberOfLines={1} ellipsizeMode="tail" style={s.journeyCity}>{origin}</Txt></View>
      <View style={s.journeyRouteArrow}><ArrowRight size={components.journeyCard.arrowIconSize} color={components.journeyCard.arrowForeground} strokeWidth={components.journeyCard.arrowStrokeWidth} /></View>
      <View style={[s.journeyRouteEnd, s.journeyRouteEndRight]}><Txt numberOfLines={1} ellipsizeMode="tail" style={s.journeyRouteLabel}>To</Txt><Txt numberOfLines={1} ellipsizeMode="tail" style={s.journeyCity}>{destination}</Txt></View>
    </View>
    <View style={s.journeyDivider} />
    {detail}
    <View style={s.journeyDateRow}><Txt style={s.journeyDateCopy}>{date}</Txt><Txt style={s.journeyDateCopy}>{time}</Txt></View>
    {children}
    {action ? <Button title={action.title} variant="lime" busy={action.busy} onPress={action.onPress} style={s.journeyAction} /> : null}
  </Card>;
}

export function SectionTitle({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <View style={s.sectionTitle}><View style={{ flex: 1 }}><Txt style={s.h2}>{title}</Txt>{subtitle && <Txt style={[s.muted, { marginTop: 5 }]}>{subtitle}</Txt>}</View>{action && onAction && <Button variant="ghost" small title={action} icon={<ArrowUpRight size={15} color={colors.text} />} onPress={onAction} />}</View>;
}

export function Empty({ title, detail, action, onAction, illustration }: { title: string; detail: string; action?: string; onAction?: () => void; illustration?: IllustrationName }) {
  return <Card style={s.emptyCard}>{illustration ? <BrandIllustration name={illustration} size={112} /> : <View style={s.emptyIcon}><ArrowUpRight size={24} color={colors.forest} /></View>}<Txt style={s.h3}>{title}</Txt>{detail ? <Txt style={s.emptyDetail}>{detail}</Txt> : null}{action && onAction && <Button title={action} onPress={onAction} variant="lime" style={s.emptyAction} />}</Card>;
}

export function Notice({ children, tone = "neutral", illustration }: React.PropsWithChildren<{ tone?: "neutral" | "warning" | "error" | "success"; illustration?: IllustrationName }>) {
  const noticeStyle = tone === "error"
    ? { backgroundColor: semantic.color.background.dangerSoft, color: semantic.color.text.danger }
    : tone === "warning"
      ? { backgroundColor: semantic.color.background.warningSoft, color: semantic.color.text.warning }
      : tone === "success"
        ? { backgroundColor: semantic.color.background.successSoft, color: semantic.color.text.success }
        : { backgroundColor: semantic.color.background.subtle, color: semantic.color.brand.primaryStrong };
  return <View accessibilityRole={tone === "error" ? "alert" : "text"} style={[s.notice, { backgroundColor: noticeStyle.backgroundColor }, illustration && { flexDirection: "row", alignItems: "center", gap: 12 }]}>{illustration && <BrandIllustration name={illustration} size={72} style={{ flexShrink: 0 }} />}<Txt style={[s.noticeText, { color: noticeStyle.color }, illustration && { flex: 1, minWidth: 0 }]}>{children}</Txt></View>;
}

export function OfflineBadge({ queued = false }: { queued?: boolean }) {
  return <Badge label={queued ? "Offline · changes will sync" : "Offline"} tone="neutral" />;
}

export type LoadingAmbiance = "vanilla" | "midnight" | "pink" | "dreamy";

const skeletonTint: Record<LoadingAmbiance, string> = {
  vanilla: "rgba(43, 60, 51, 0.12)",
  midnight: "rgba(157, 177, 166, 0.16)",
  pink: "rgba(193, 105, 132, 0.14)",
  dreamy: "rgba(142, 112, 190, 0.13)",
};

export function SkeletonBlock({ width = "100%", height, radius = 6, ambiance = "vanilla", style }: {
  width?: ViewStyle["width"];
  height: number;
  radius?: number;
  ambiance?: LoadingAmbiance;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = React.useRef(new Animated.Value(0.52)).current;
  React.useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.92, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.52, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: skeletonTint[ambiance], opacity }, style]} />;
}

export function ContentSkeleton({ rows = 3, ambiance = "vanilla" }: { rows?: number; ambiance?: LoadingAmbiance }) {
  const visible = useDelayedVisibility(true);
  if (!visible) return <View style={s.skeletonReserve} />;
  return <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={s.skeletonList}>
    {Array.from({ length: rows }, (_, index) => <View key={index} style={s.skeletonRow}>
      <SkeletonBlock ambiance={ambiance} height={10} width={index % 2 ? "58%" : "76%"} />
      <SkeletonBlock ambiance={ambiance} height={8} width="36%" />
    </View>)}
  </View>;
}

export function InlineSkeleton({ label = "Loading", ambiance = "vanilla" }: { label?: string; ambiance?: LoadingAmbiance }) {
  return <View accessibilityLabel={label} accessibilityRole="progressbar" style={s.inlineSkeleton}>
    <SkeletonBlock ambiance={ambiance} width={86} height={10} />
    <SkeletonBlock ambiance={ambiance} width="48%" height={10} />
  </View>;
}

export function InlineLoading({ label = "Loading…", color }: { label?: string; color?: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={s.inlineLoading}>
      <ActivityIndicator size="small" color={color ?? semantic.color.brand.primaryStrong} />
      {label ? <Txt style={s.inlineLoadingText}>{label}</Txt> : null}
    </View>
  );
}

export function AppLoadingScreen({ label = "Loading Passenger…" }: { label?: string }) {
  return (
    <SafeAreaView accessibilityLabel={label} accessibilityRole="progressbar" style={s.appLoadingScreen}>
      <View style={s.appLoadingInner}>
        <ActivityIndicator size="large" color={semantic.color.brand.primaryStrong} />
        {label ? <Txt style={s.appLoadingLabel}>{label}</Txt> : null}
      </View>
    </SafeAreaView>
  );
}

export function ScreenSkeleton({ ambiance = "vanilla" }: { ambiance?: LoadingAmbiance }) {
  return <SafeAreaView accessibilityLabel="Loading Passenger" accessibilityRole="progressbar" style={s.skeletonScreen}>
    <View style={s.skeletonScreenInner}>
      <SkeletonBlock ambiance={ambiance} width={72} height={18} radius={9} />
      <View style={s.skeletonHero}>
        <SkeletonBlock ambiance={ambiance} width="84%" height={38} radius={10} />
        <SkeletonBlock ambiance={ambiance} width="62%" height={38} radius={10} />
      </View>
      <View style={s.skeletonScreenCopy}>
        <SkeletonBlock ambiance={ambiance} width="92%" height={12} />
        <SkeletonBlock ambiance={ambiance} width="70%" height={12} />
      </View>
    </View>
  </SafeAreaView>;
}

export function Hydrated({ children }: React.PropsWithChildren) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export function Check({ checked, onChange, children }: React.PropsWithChildren<{ checked: boolean; onChange: (checked: boolean) => void }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.checkRow}><View style={[s.checkbox, checked && s.checkboxChecked]}>{checked && <CheckIcon size={14} color="white" strokeWidth={3} />}</View><Txt style={s.checkText}>{children}</Txt></Pressable>;
}

export function AuthCheckbox({ checked, onChange, children }: React.PropsWithChildren<{ checked: boolean; onChange: (checked: boolean) => void }>) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.authCheckRow}><View style={[s.authCheckbox, checked && s.authCheckboxChecked]}>{checked && <CheckIcon size={14} color="white" strokeWidth={3} />}</View><Txt style={s.authCheckText}>{children}</Txt></Pressable>;
}

function BottomSheetFrame({ title, onClose, onBack, backDisabled, children, footer, titleStyle, bodyStyle, containerStyle }: React.PropsWithChildren<{ title: string; onClose: () => void; onBack?: () => void; backDisabled?: boolean; footer?: React.ReactNode; titleStyle: StyleProp<TextStyle>; bodyStyle: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle> }>) {
  return <Modal transparent visible animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.presentationOverlay}><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={StyleSheet.absoluteFill} /><SafeAreaView edges={["bottom"]} style={[s.presentationSheet, containerStyle]}><View style={s.presentationHandle} /><View style={s.sheetHeader}>{onBack && <BackButton disabled={backDisabled} onPress={onBack} />}<View style={{ flex: 1 }}><Txt style={titleStyle}>{title}</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={s.close}><X size={20} color={semantic.color.text.tertiary} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[bodyStyle, footer ? s.sheetBodyWithFooter : undefined]}>{children}</ScrollView>{footer ? <View style={s.sheetFooter}>{footer}</View> : null}</SafeAreaView></KeyboardAvoidingView></Modal>;
}

export function Sheet({ title, onClose, onBack, backDisabled, children, wide = false }: React.PropsWithChildren<{ title: string; onClose: () => void; onBack?: () => void; backDisabled?: boolean; wide?: boolean }>) {
  return <BottomSheetFrame title={title} onClose={onClose} onBack={onBack} backDisabled={backDisabled} titleStyle={s.sheetTitle} bodyStyle={s.sheetBody} containerStyle={[s.sheetContainer, wide && s.sheetContainerWide]}>{children}</BottomSheetFrame>;
}

export function PresentationSheet({ title, onClose, children, footer, containerStyle }: React.PropsWithChildren<{ title: string; onClose: () => void; footer?: React.ReactNode; containerStyle?: StyleProp<ViewStyle> }>) {
  return <BottomSheetFrame title={title} onClose={onClose} footer={footer} containerStyle={containerStyle} titleStyle={s.presentationTitle} bodyStyle={s.presentationBody}>{children}</BottomSheetFrame>;
}

export function FullScreenState({ title, subtitle, primaryAction, secondaryAction, onRequestClose }: {
  title: string;
  subtitle: string;
  primaryAction: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  onRequestClose?: () => void;
}) {
  return <Modal
    visible
    animationType="fade"
    presentationStyle="fullScreen"
    onRequestClose={onRequestClose ?? secondaryAction?.onPress ?? primaryAction.onPress}
  >
    <SafeAreaView style={s.takeoverScreen}>
      <View accessibilityViewIsModal style={s.takeoverContent}>
        <View style={s.takeoverCopy}>
          <Txt accessibilityRole="header" style={s.takeoverTitle}>{title}</Txt>
          <Txt style={s.takeoverSubtitle}>{subtitle}</Txt>
        </View>
        <View style={s.takeoverActions}>
          <Button title={primaryAction.label} variant="lime" onPress={primaryAction.onPress} />
          {secondaryAction ? <Button title={secondaryAction.label} variant="ghost" onPress={secondaryAction.onPress} /> : null}
        </View>
      </View>
    </SafeAreaView>
  </Modal>;
}

export function FullScreenSheet({ title, onClose, children, footer }: React.PropsWithChildren<{ title: string; onClose: () => void; footer?: React.ReactNode }>) {
  return <BottomSheetFrame title={title} onClose={onClose} footer={footer} titleStyle={s.presentationTitle} bodyStyle={s.fullScreenBody} containerStyle={s.tallSheet}>{children}</BottomSheetFrame>;
}

export function RouteLine({ origin, destination, compact = false }: { origin: string; destination: string; compact?: boolean }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: primitives.space[3] }}><Txt numberOfLines={1} ellipsizeMode="tail" style={[s.routeText, compact && s.routeTextCompact]}>{origin}</Txt><View style={{ flex: 1, maxWidth: 75, height: 1, backgroundColor: semantic.color.border.subtle }} /><ArrowRight size={16} color={colors.muted} /><Txt numberOfLines={1} ellipsizeMode="tail" style={[s.routeText, compact && s.routeTextCompact]}>{destination}</Txt></View>;
}

export const shortDate = (timestamp: number) => new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const timeDate = (timestamp: number) => `${shortDate(timestamp)} · ${new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

export function errorMessage(error: unknown, fallback = "We couldn't finish that. Please try again.") {
  return formatErrorMessage(error, fallback);
}

export const s = StyleSheet.create({
  backButton: { width: components.iconButton.size, height: components.iconButton.size, flexShrink: 0, borderRadius: primitives.radius.pill, alignItems: "center", justifyContent: "center" },
  backButtonPressed: { backgroundColor: semantic.color.background.subtle },
  text: { color: colors.text, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, fontFamily: fontFamily.regular },
  expandableText: { alignItems: "flex-start", minWidth: 0 },
  expandAction: { marginTop: 4, color: colors.text, opacity: 0.62, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.medium },
  muted: { color: colors.muted, fontSize: primitives.typography.size.bodyXs, lineHeight: primitives.typography.lineHeight.bodyXs, fontFamily: fontFamily.regular },
  h2: { fontSize: primitives.typography.size.headingH2, lineHeight: primitives.typography.lineHeight.headingH2, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  h3: { fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.regular },
  sheetTitle: { fontSize: primitives.typography.size.headingH1, lineHeight: primitives.typography.lineHeight.headingH1, fontFamily: fontFamily.medium, letterSpacing: -0.6 },
  detailLabel: { color: colors.muted, fontSize: 12, lineHeight: 18, fontFamily: fontFamily.medium, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  button: { minHeight: components.button.height.lg, borderRadius: primitives.radius.pill, paddingHorizontal: 28, paddingVertical: 16, flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" },
  buttonSmall: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 10 },
  buttonPrimary: { backgroundColor: semantic.color.action.primary },
  buttonLime: { backgroundColor: semantic.color.action.primary },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: primitives.borderWidth.sm, borderColor: semantic.color.border.action },
  buttonGhost: { backgroundColor: "transparent" },
  buttonDanger: { backgroundColor: semantic.color.text.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.9 },
  buttonText: { fontSize: primitives.typography.size.button, lineHeight: primitives.typography.lineHeight.button, fontFamily: fontFamily.medium, color: semantic.color.action.primary },
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
  inputMultiline: { minHeight: 98, textAlignVertical: "top", paddingVertical: 14 },
  hint: { fontSize: 11, lineHeight: 17, color: colors.muted, fontFamily: fontFamily.regular },
  badge: { flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: primitives.radius.pill },
  badgeDot: { width: 5, height: 5, borderRadius: 2.5 },
  badgeText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontFamily: fontFamily.medium },
  card: { backgroundColor: components.card.background, borderRadius: components.card.radius, borderWidth: components.card.borderWidth, borderColor: components.card.borderColor, padding: components.card.padding },
  journeyCardStack: { gap: components.journeyCard.stackGap },
  journeyCard: { backgroundColor: "transparent", borderWidth: 0, borderBottomWidth: primitives.borderWidth.sm, borderBottomColor: semantic.color.border.subtle, borderRadius: 0, paddingHorizontal: 0, paddingVertical: components.journeyCard.paddingY, shadowOpacity: 0, elevation: 0 },
  journeyRouteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  journeyRouteEnd: { flex: 1, minWidth: 0, gap: components.journeyCard.routeEndGap },
  journeyRouteEndRight: { alignItems: "flex-end" },
  journeyRouteLabel: { fontSize: components.journeyCard.routeLabelSize, lineHeight: components.journeyCard.routeLabelLineHeight, color: semantic.color.text.tertiary, fontFamily: fontFamily.regular },
  journeyCity: { maxWidth: "100%", fontSize: components.journeyCard.citySize, lineHeight: components.journeyCard.cityLineHeight, color: semantic.color.text.primary, fontFamily: fontFamily.semibold },
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
  skeletonReserve: { minHeight: 164 },
  skeletonList: { gap: 12, minHeight: 164 },
  skeletonRow: { minHeight: 46, justifyContent: "center", gap: 9 },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: semantic.color.background.subtle },
  skeletonLineShort: { width: "36%", height: 8, opacity: 0.7 },
  inlineSkeleton: { minHeight: 28, justifyContent: "center", gap: 8 },
  inlineLoading: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 10 },
  inlineLoadingText: { fontSize: primitives.typography.size.bodyXs, color: colors.muted, fontFamily: fontFamily.regular },
  appLoadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  appLoadingInner: { alignItems: "center", justifyContent: "center", gap: 14 },
  appLoadingLabel: { fontSize: primitives.typography.size.bodySm, color: colors.muted, fontFamily: fontFamily.regular },
  skeletonScreen: { flex: 1, backgroundColor: colors.bg },
  skeletonScreenInner: { flex: 1, width: "100%", maxWidth: 440, alignSelf: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 28 },
  skeletonHero: { marginTop: 38, gap: 8 },
  skeletonScreenCopy: { marginTop: 22, gap: 10 },
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
  tallSheet: { alignSelf: "center", width: "100%", maxWidth: 780, maxHeight: "94%" },
  fullScreenOverlay: { flex: 1, backgroundColor: components.actionSheet.background },
  fullScreenSheet: { flex: 1, backgroundColor: components.actionSheet.background },
  sheetContainer: { alignSelf: "center", width: "100%", maxWidth: 580 },
  sheetContainerWide: { maxWidth: 780 },
  presentationHandle: { alignSelf: "center", width: components.actionSheet.handleWidth, height: components.actionSheet.handleHeight, borderRadius: components.actionSheet.handleRadius, backgroundColor: colors.border, marginTop: components.actionSheet.handleMarginTop, marginBottom: components.actionSheet.handleMarginBottom },
  sheetHeader: { paddingHorizontal: components.actionSheet.paddingX, paddingBottom: components.actionSheet.headerPaddingBottom, flexDirection: "row", alignItems: "center", gap: primitives.space[3] },
  fullScreenHeader: { paddingHorizontal: components.actionSheet.paddingX, paddingTop: primitives.space[2], paddingBottom: components.actionSheet.headerPaddingBottom, flexDirection: "row", alignItems: "center", gap: primitives.space[3], borderBottomWidth: primitives.borderWidth.sm, borderBottomColor: colors.border },
  presentationTitle: { flex: 1, fontSize: primitives.typography.size.headingH3, lineHeight: primitives.typography.lineHeight.headingH3, fontFamily: fontFamily.medium, color: colors.text },
  presentationBody: { paddingHorizontal: components.actionSheet.paddingX, paddingBottom: components.actionSheet.bodyPaddingBottom, gap: components.actionSheet.contentGap },
  sheetBodyWithFooter: { paddingBottom: primitives.space[6] },
  sheetFooter: { paddingHorizontal: components.actionSheet.paddingX, paddingTop: primitives.space[3], paddingBottom: primitives.space[2], borderTopWidth: primitives.borderWidth.sm, borderTopColor: semantic.color.border.subtle, backgroundColor: components.actionSheet.background },
  takeoverScreen: { flex: 1, backgroundColor: colors.bg },
  takeoverContent: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "space-between", paddingHorizontal: primitives.space[6], paddingTop: primitives.space[12], paddingBottom: primitives.space[6] },
  takeoverCopy: { flex: 1, justifyContent: "center", gap: primitives.space[3] },
  takeoverTitle: { fontSize: primitives.typography.size.headingH1Web, lineHeight: primitives.typography.lineHeight.headingH1Web, fontFamily: fontFamily.semibold, color: colors.text, letterSpacing: -0.6 },
  takeoverSubtitle: { maxWidth: 420, fontSize: primitives.typography.size.bodySm, lineHeight: primitives.typography.lineHeight.bodySm, color: colors.muted, fontFamily: fontFamily.regular },
  takeoverActions: { gap: primitives.space[2] },
  fullScreenBody: { paddingHorizontal: components.actionSheet.paddingX, paddingTop: primitives.space[4], paddingBottom: components.actionSheet.bodyPaddingBottom, gap: components.actionSheet.contentGap },
  sheetBody: { paddingHorizontal: components.actionSheet.paddingX, paddingBottom: components.actionSheet.bodyPaddingBottom, gap: components.actionSheet.contentGap },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 19 },
  routeText: { fontSize: primitives.typography.size.bodyLg, lineHeight: primitives.typography.lineHeight.bodyLg, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  routeTextCompact: { fontSize: primitives.typography.size.bodyMd, lineHeight: primitives.typography.lineHeight.bodyMd },
  routeArrow: { color: semantic.color.text.tertiary, fontSize: 19, lineHeight: 24, fontFamily: fontFamily.regular },
});
