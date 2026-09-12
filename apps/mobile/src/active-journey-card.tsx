import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from "react-native";
import { CalendarDays, Clock3, Truck } from "lucide-react-native";
import { semantic } from "@passenger/design-tokens";
import { Button, Txt, colors, fontFamily } from "./ui";

/** A decorative journey illustration, never a live location indicator. */
function VehicleRoute({ moving }: { moving: boolean }) {
  const progress = useRef(new Animated.Value(0.5)).current;
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    let mounted = true;
    let changed = false;
    const preference = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !changed) setReduceMotion(value);
    }).catch(() => {});
    const appState = AppState.addEventListener("change", value => setActive(value === "active"));
    return () => { mounted = false; preference.remove(); appState.remove(); };
  }, []);

  useEffect(() => {
    if (!moving || reduceMotion || !active || width < 36) {
      progress.setValue(0.5);
      return;
    }
    progress.setValue(0);
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: 4800, easing: Easing.inOut(Easing.quad),
      useNativeDriver: Platform.OS !== "web", isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [active, moving, progress, reduceMotion, width]);

  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
    style={styles.route} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.rail} />
    <View style={styles.originDot} />
    <View style={styles.destinationDot} />
    <Animated.View style={[styles.vehicle, {
      opacity: moving && !reduceMotion && active ? progress.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] }) : 1,
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, width - 34)] }) }],
    }]}><Truck size={21} strokeWidth={1.8} color={colors.forest} /></Animated.View>
  </View>;
}

export function ActiveJourneyCard({ origin, destination, date, time, ongoing, action, onReport, children }: React.PropsWithChildren<{
  origin: string;
  destination: string;
  date: string;
  time: string;
  ongoing: boolean;
  onReport: () => void;
  action?: { title: string; onPress: () => void; busy?: boolean };
}>) {
  return <View style={styles.card}>
    <View style={styles.body}>
      <View style={styles.header}>
        <View style={[styles.badge, !ongoing && styles.upcomingBadge]}>
          <View style={[styles.statusDot, !ongoing && { backgroundColor: colors.muted }]} />
          <Txt style={styles.badgeText}>{ongoing ? "On the road" : "Upcoming"}</Txt>
        </View>
      </View>
      <View style={styles.cities}>
        <View style={styles.endpoint}><Txt style={styles.label}>From</Txt><Txt style={styles.city}>{origin}</Txt></View>
        <VehicleRoute moving={ongoing} />
        <View style={[styles.endpoint, styles.destination]}><Txt style={styles.label}>To</Txt><Txt style={[styles.city, styles.rightText]}>{destination}</Txt></View>
      </View>
    </View>
    <View style={styles.tearLine} />
    <View style={styles.footer}>
      <View style={styles.schedule}>
        <View style={styles.scheduleItem}><CalendarDays size={15} color={colors.muted} /><View><Txt style={styles.label}>Departure date</Txt><Txt style={styles.scheduleValue}>{date}</Txt></View></View>
        <View style={styles.scheduleItem}><Clock3 size={15} color={colors.muted} /><View><Txt style={styles.label}>Departs</Txt><Txt style={styles.scheduleValue}>{time}</Txt></View></View>
      </View>
      {children}
      {action ? <Button title={action.title} busy={action.busy} onPress={action.onPress} variant="lime" style={styles.action} /> : null}
      <Button title="Something went wrong" variant="ghost" small onPress={onReport} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: semantic.color.border.subtle, borderRadius: 24, overflow: "hidden", shadowColor: semantic.color.text.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 2 },
  body: { padding: 20, backgroundColor: semantic.color.background.successSoft },
  header: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 26 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: semantic.color.background.successSoft },
  upcomingBadge: { backgroundColor: semantic.color.background.subtle },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: semantic.color.text.success },
  badgeText: { fontSize: 11, color: colors.forest, fontFamily: fontFamily.semibold },
  cities: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 6 },
  endpoint: { flex: 1, minWidth: 0, gap: 5 },
  destination: { alignItems: "flex-end" },
  label: { fontSize: 10, color: colors.muted, lineHeight: 16 },
  city: { fontSize: 23, lineHeight: 28, fontFamily: fontFamily.semibold, color: colors.forest },
  rightText: { textAlign: "right" },
  route: { flex: 0.8, minWidth: 52, maxWidth: 140, height: 38, marginTop: 17 },
  rail: { position: "absolute", left: 3, right: 3, top: 18, borderTopWidth: 1, borderStyle: "dashed", borderColor: semantic.color.border.action },
  originDot: { position: "absolute", left: 0, top: 15, width: 7, height: 7, borderRadius: 4, backgroundColor: semantic.color.background.successSoft, borderWidth: 1.5, borderColor: semantic.color.text.success },
  destinationDot: { position: "absolute", right: 0, top: 15, width: 7, height: 7, borderRadius: 4, backgroundColor: semantic.color.text.success },
  vehicle: { position: "absolute", top: 1, left: 0, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: semantic.color.background.successSoft, borderWidth: 3, borderColor: semantic.color.background.successSoft },
  tearLine: { borderTopWidth: 1, borderColor: semantic.color.border.subtle, borderStyle: "dashed", marginHorizontal: 16 },
  footer: { padding: 20, gap: 12 },
  schedule: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 14 },
  scheduleItem: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  scheduleValue: { fontSize: 12, lineHeight: 19, fontFamily: fontFamily.semibold, color: colors.forest },
  action: { minHeight: 44, borderRadius: 14 },
});
