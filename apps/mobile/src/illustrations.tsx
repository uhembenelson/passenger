import React from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ImageStyle, StyleProp, ViewStyle } from "react-native";

export type IllustrationName = "identityVerification" | "phoneVerification" | "milestonesClear" | "routesEmpty" | "createParcel" | "createTrip";
export type CityIllustrationName = "Jos" | "Abuja" | "Lagos" | "Kaduna" | "Kano" | "Ibadan" | "Enugu" | "Port Harcourt";
export type NavigationIllustrationName = "home" | "milestones" | "trips" | "profile";

const sources = {
  identityVerification: require("../assets/illustrations/identity-verification.webp"),
  phoneVerification: require("../assets/illustrations/phone-verification.webp"),
  milestonesClear: require("../assets/illustrations/milestones-clear.webp"),
  routesEmpty: require("../assets/illustrations/routes-empty.webp"),
  createParcel: require("../assets/illustrations/create-parcel.webp"),
  createTrip: require("../assets/illustrations/create-trip.webp"),
} as const;

const citySources = {
  Jos: require("../assets/illustrations/city-jos.webp"),
  Abuja: require("../assets/illustrations/city-abuja.webp"),
  Lagos: require("../assets/illustrations/city-lagos.webp"),
  Kaduna: require("../assets/illustrations/city-kaduna.webp"),
  Kano: require("../assets/illustrations/city-kano.webp"),
  Ibadan: require("../assets/illustrations/city-ibadan.webp"),
  Enugu: require("../assets/illustrations/city-enugu.webp"),
  "Port Harcourt": require("../assets/illustrations/city-port-harcourt.webp"),
} as const;

const navigationSources = {
  home: require("../assets/navigation/tab-home.webp"),
  milestones: require("../assets/navigation/tab-milestones.webp"),
  trips: require("../assets/navigation/tab-trips.webp"),
  profile: require("../assets/navigation/tab-profile.webp"),
} as const;

export function BrandIllustration({ name, size = 112, style, imageStyle }: {
  name: IllustrationName;
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size }, style]}>
    <Image source={sources[name]} resizeMode="contain" style={[styles.image, imageStyle]} />
  </View>;
}

export function CityIllustration({ city, size = 42, style }: { city: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const canonical = Object.keys(citySources).find(name => name.toLowerCase() === city.trim().toLowerCase()) as CityIllustrationName | undefined;
  if (!canonical) return null;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size }, style]}>
    <Image source={citySources[canonical]} resizeMode="contain" style={styles.image} />
  </View>;
}

export function NavigationIllustration({ name, size = 30, style }: { name: NavigationIllustrationName; size?: number; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size }, style]}>
    <Image source={navigationSources[name]} resizeMode="contain" style={styles.image} />
  </View>;
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
});
