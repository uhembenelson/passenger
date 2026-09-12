import React, { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { semantic } from "@passenger/design-tokens";

const ink = semantic.color.brand.primaryStrong;
const VehicleLayer = Platform.OS === "web" ? View : Animated.View;

/** Decorative route, independent of live shipment locations. */
export const HomeTripBackground = memo(function HomeTripBackground({ compact = false }: { compact?: boolean }) {
  const [width, setWidth] = useState(440);
  const progress = useRef(new Animated.Value(0.5)).current;
  // Keep the illustration still until the accessibility preference is known.
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      preferenceChanged = true;
      setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !preferenceChanged) setReduceMotion(value);
    }).catch(() => { /* Retain the still illustration if the preference is unavailable. */ });
    const state = AppState.addEventListener("change", value => setActive(value === "active"));
    return () => {
      mounted = false;
      motion?.remove();
      state?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (reduceMotion || !active) {
      progress.setValue(0.5);
      return;
    }
    progress.setValue(0);
    // Animate one small layer, never SVG geometry or React state on each frame.
    const journey = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 28000,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    }));
    journey.start();
    return () => journey.stop();
  }, [active, progress, reduceMotion]);

  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={styles.backdrop}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.map, compact && { right: 16 }, { transform: [{ scale: Math.min(1, width / 440, compact ? 170 / 760 : 1) }] }]}>
        <Svg width={440} height={760} viewBox="0 0 440 760" style={styles.linework}>
          <G fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
            {/* Quiet side streets and open blocks give the route a sense of place. */}
            <Path d="M-30 170H160Q200 170 200 210V550Q200 580 170 580H-20 M270 70V185Q270 220 305 220H460 M245 620H460 M70 310H255 M85 710V480" strokeWidth={1} />
            <Rect x={230} y={255} width={58} height={72} rx={14} strokeWidth={1} />
            <Rect x={108} y={355} width={52} height={96} rx={14} strokeWidth={1} />
            <Path d="M25 660H115Q155 660 155 620V575Q155 530 205 530H285Q350 530 350 465V300Q350 240 390 195L425 155" strokeWidth={24} opacity={0.38} />
            <Path d="M25 660H115Q155 660 155 620V575Q155 530 205 530H285Q350 530 350 465V300Q350 240 390 195L425 155" strokeWidth={1.5} strokeDasharray="3 9" />
            <Circle cx={25} cy={660} r={9} strokeWidth={2} />
            <Circle cx={25} cy={660} r={3} fill={ink} stroke="none" />
            <Path d="M425 155s-16-18-16-29a16 16 0 0 1 32 0c0 11-16 29-16 29Z" strokeWidth={2} />
            <Circle cx={425} cy={126} r={5} strokeWidth={2} />
            {/* Small groves beside the road. */}
            <Circle cx={255} cy={390} r={14} strokeWidth={1.5} />
            <Circle cx={277} cy={413} r={10} strokeWidth={1.5} />
            <Path d="M255 390v24m22-1v18 M51 535v20m-9-20a9 9 0 1 0 18 0a9 9 0 1 0-18 0" strokeWidth={1.5} />
          </G>
        </Svg>
        <VehicleLayer style={[styles.vehicle, Platform.OS === "web"
          ? [styles.webVehicle, !reduceMotion && active ? styles.webMotion : null]
          : {
          opacity: progress.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 0.34, 0.34, 0] }),
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [65, -65] }) }],
        }]}>
          <Svg width={22} height={34} viewBox="0 0 22 34">
            <Rect x={3} y={2} width={16} height={30} rx={5} fill={ink} />
            <Path d="M6 10h10l-1-5H7Z M6 24h10v4H6Z" fill={semantic.color.background.app} />
            <Path d="M1 9v5m20-5v5M1 23v4m20-4v4" stroke={ink} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </VehicleLayer>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  map: { position: "absolute", width: 440, height: 760, right: 0, top: 0, transformOrigin: "top right" },
  linework: { opacity: 0.22 },
  webVehicle: { opacity: 0.34 },
  // React Native Web compiles these to CSS; no requestAnimationFrame work in JS.
  webMotion: {
    animationDuration: "28s",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    animationKeyframes: {
      "0%": { opacity: 0, transform: "translateY(65px)" },
      "12%": { opacity: 0.34 },
      "88%": { opacity: 0.34 },
      "100%": { opacity: 0, transform: "translateY(-65px)" },
    },
  } as ViewStyle,
  vehicle: { position: "absolute", left: 339, top: 365, width: 22, height: 34 },
});
