import React from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { semantic } from "@passenger/design-tokens";

/**
 * Marks drawn in the Hairline language of the figures on the marketing site: one
 * rounded stroke, no fills, and a single bright accent that marks the one place a
 * mark is about. The silhouette stays dark, the crease inside it stays dim, and the
 * accent lights the part that carries the meaning.
 *
 * Every mark is drawn in a 32 × 32 viewBox and scales with `size`.
 */
const HAIRLINE = {
  /** Silhouette, in hand. */
  ink: semantic.color.text.primary,
  /** Silhouette, at rest: quiet enough to let the chosen tab lead. */
  inkQuiet: "#7C857C",
  /** The dim inside edge, in hand. */
  crease: "#AEB7B0",
  /** The dim inside edge, at rest. */
  creaseQuiet: "#C7CEC8",
  /** The one bright mark. It only lights where the hand is. */
  edge: semantic.color.brand.primary,
} as const;

const SILHOUETTE = 1.7;
const CREASE = 1.15;

type Pen = { line: string; crease: string; accent: string };

function pen(active: boolean): Pen {
  return {
    line: active ? HAIRLINE.ink : HAIRLINE.inkQuiet,
    crease: active ? HAIRLINE.crease : HAIRLINE.creaseQuiet,
    accent: active ? HAIRLINE.edge : HAIRLINE.inkQuiet,
  };
}

export type NavigationIllustrationName = "home" | "milestones" | "trips" | "profile";

/** A house: roof and walls as one stroke, a soffit crease inside, and the door bright. */
function HomeMark({ pen }: { pen: Pen }) {
  return <>
    <Path d="M15.3 5.65Q16 5 16.7 5.65L26.2 13.35Q27 14.05 27 15.2V24Q27 26 25 26H7Q5 26 5 24V15.2Q5 14.05 5.8 13.35Z" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M6.6 16.2H25.4" stroke={pen.crease} strokeWidth={CREASE} />
    <Path d="M13.6 25.9V21.5Q13.6 20.2 14.9 20.2H17.1Q18.4 20.2 18.4 21.5V25.9" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** A journey: two stops, the road between them dashed, and you on the road. */
function TripsMark({ pen }: { pen: Pen }) {
  return <>
    <Path d="M9.6 11.1C9.6 17.5 22.4 13.6 22.4 20.9" stroke={pen.line} strokeWidth={1.45} strokeDasharray="2.5 2.7" />
    <Rect x={5.9} y={5.9} width={5.2} height={5.2} rx={1.8} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={20.9} y={20.9} width={5.2} height={5.2} rx={1.8} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Circle cx={16} cy={15.66} r={2.15} fill={pen.accent} stroke="none" />
  </>;
}

/** A person: shoulders with a collar seam inside, and the head bright. */
function ProfileMark({ pen }: { pen: Pen }) {
  return <>
    <Path d="M7.4 26.4C7.4 21.6 11.2 19.4 16 19.4C20.8 19.4 24.6 21.6 24.6 26.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M9.4 26.4C9.4 22.8 12.4 20.9 16 20.9C19.6 20.9 22.6 22.8 22.6 26.4" stroke={pen.crease} strokeWidth={CREASE} />
    <Circle cx={16} cy={11.4} r={4.4} stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** A milestone: a post marked with ticks, and the flag bright. */
function MilestonesMark({ pen }: { pen: Pen }) {
  return <>
    <Path d="M15.4 26.4V6.6" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M12.6 20.4H18.2M12.6 23.6H18.2" stroke={pen.crease} strokeWidth={CREASE} />
    <Path d="M15.4 6.6H24Q25.4 6.6 25.4 8V11.8Q25.4 13.2 24 13.2H15.4Z" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

export function NavigationIllustration({ name, size = 30, active = false, style }: {
  name: NavigationIllustrationName;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const strokes = pen(active);
  return <Mark size={size} style={style}>
    <G strokeLinecap="round" strokeLinejoin="round">
      {name === "home" && <HomeMark pen={strokes} />}
      {name === "trips" && <TripsMark pen={strokes} />}
      {name === "profile" && <ProfileMark pen={strokes} />}
      {name === "milestones" && <MilestonesMark pen={strokes} />}
    </G>
  </Mark>;
}

export type ActionIllustrationName = "sendParcel" | "travelling";

/** A parcel: a sealed box with its lid crease inside and the tape bright. */
function SendParcelMark({ pen }: { pen: Pen }) {
  return <>
    <Rect x={5} y={7} width={22} height={18} rx={3.2} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M6.6 11.9H25.4" stroke={pen.crease} strokeWidth={CREASE} />
    <Path d="M16 7.8V24.2" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** A trip: a case with its seam inside and the handle bright. */
function TravellingMark({ pen }: { pen: Pen }) {
  return <>
    <Rect x={4.6} y={11} width={22.8} height={14.6} rx={3.2} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M6 17.4H26" stroke={pen.crease} strokeWidth={CREASE} />
    <Path d="M12.6 11V8.5Q12.6 6.4 14.7 6.4H17.3Q19.4 6.4 19.4 8.5V11" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/**
 * A primary action mark. These sit on cards a hand is meant to reach for, so they
 * are drawn in hand: dark silhouette, dim crease, bright accent.
 */
export function ActionIllustration({ name, size = 72, style }: {
  name: ActionIllustrationName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const strokes = pen(true);
  return <Mark size={size} style={style}>
    <G strokeLinecap="round" strokeLinejoin="round">
      {name === "sendParcel" && <SendParcelMark pen={strokes} />}
      {name === "travelling" && <TravellingMark pen={strokes} />}
    </G>
  </Mark>;
}

/**
 * A place, drawn the way the marketing site draws a city: everything stands on one
 * ground line, so the set stays level wherever a list of cities scrolls. Each city
 * gets a figure of its own, built around the one thing that names it, and that one
 * thing is the bright mark.
 */
function Ground({ pen }: { pen: Pen }) {
  return <Path d="M4.6 25.4H27.4" stroke={pen.crease} strokeWidth={CREASE} />;
}

/** Any city we have no figure for: a few towers, the tallest one lit. */
function PlaceMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Rect x={6.6} y={12.2} width={5.4} height={13.2} rx={1.9} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={13.4} y={7} width={5.2} height={18.4} rx={2} stroke={pen.accent} strokeWidth={SILHOUETTE} />
    <Rect x={20} y={14.6} width={5.4} height={10.8} rx={1.9} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M15.2 11.2H16.8M15.2 15.2H16.8" stroke={pen.crease} strokeWidth={CREASE} />
  </>;
}

/** Jos: the flat-topped plateau, with a rock line across its face. */
function JosMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Path d="M5.6 25.4L8.8 10.2Q9.5 9 11 9" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M21 9Q22.5 9 23.2 10.2L26.4 25.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M11 9H21" stroke={pen.accent} strokeWidth={SILHOUETTE} />
    <Path d="M8.6 20.6H19.4" stroke={pen.crease} strokeWidth={CREASE} />
  </>;
}

/** Abuja: the capital's tower, and the mast above it. */
function AbujaMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Rect x={6.8} y={20.4} width={5.2} height={5} rx={1.6} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={20} y={19} width={5.2} height={6.4} rx={1.6} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={13.8} y={8.6} width={4.4} height={16.8} rx={1.8} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M15.1 13.2H16.9M15.1 16.6H16.9" stroke={pen.crease} strokeWidth={CREASE} />
    <Path d="M16 8.6V5" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** Lagos: a dense skyline standing in the lagoon. */
function LagosMark({ pen }: { pen: Pen }) {
  return <>
    <Path d="M4.6 25.4C6.5 24 10.3 26.8 12.2 25.4C14.1 24 17.9 26.8 19.8 25.4C21.7 24 25.5 26.8 27.4 25.4" stroke={pen.crease} strokeWidth={CREASE} />
    <Rect x={5.8} y={15.8} width={4.8} height={9.6} rx={1.7} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={11.4} y={11.6} width={4.6} height={13.8} rx={1.7} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={16.8} y={7.8} width={5} height={17.6} rx={1.9} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={22.6} y={13.6} width={4.6} height={11.8} rx={1.7} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M16.8 7.8H21.8" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** Kaduna: the river crossing, an arch springing between two piers. */
function KadunaMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Path d="M9.6 7.4V25.4M22.4 7.4V25.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M4.8 13.4H27.2" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M9.6 13.4Q16 24.4 22.4 13.4" stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** Kano: the old walled city, a domed gate in a long wall. */
function KanoMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Path d="M5.4 25.4V19.4Q5.4 18.2 6.8 18.2H25.2Q26.6 18.2 26.6 19.4V25.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M13.2 25.4V22.4Q13.2 20.6 15 20.6H17Q18.8 20.6 18.8 22.4V25.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M9.8 18.2Q9.8 12.6 16 12.6Q22.2 12.6 22.2 18.2" stroke={pen.accent} strokeWidth={SILHOUETTE} />
    <Path d="M16 12.6V9.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
  </>;
}

/** Ibadan: the city on its hill, with its one tall house above the roofs. */
function IbadanMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Path d="M4.8 25.4C9.6 19.4 13.6 17.4 16.6 17.4C19.6 17.4 23.2 19.4 27.2 25.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={14} y={9.6} width={5.2} height={8} rx={1.8} stroke={pen.accent} strokeWidth={SILHOUETTE} />
    <Path d="M15.4 13H17.8" stroke={pen.crease} strokeWidth={CREASE} />
  </>;
}

/** Enugu: the coal city, a pit head standing over the shaft. */
function EnuguMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Path d="M9.8 25.4L16 11.4L22.2 25.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M12.2 20.6H19.8" stroke={pen.crease} strokeWidth={CREASE} />
    <Circle cx={16} cy={9} r={2.4} stroke={pen.accent} strokeWidth={SILHOUETTE} />
  </>;
}

/** Port Harcourt: the port, a crane lifting a box over the quay. */
function PortHarcourtMark({ pen }: { pen: Pen }) {
  return <>
    <Ground pen={pen} />
    <Path d="M11.6 25.4V9.6" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M11.6 14.2L18.6 9.6" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M23.6 9.6V13.4" stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Path d="M11.6 9.6H25.6" stroke={pen.accent} strokeWidth={SILHOUETTE} />
    <Rect x={21.3} y={13.4} width={4.6} height={4.2} rx={1.2} stroke={pen.line} strokeWidth={SILHOUETTE} />
    <Rect x={5.2} y={20.8} width={5} height={4.6} rx={1.3} stroke={pen.line} strokeWidth={SILHOUETTE} />
  </>;
}

export type PlaceIllustrationName = "abuja" | "enugu" | "ibadan" | "jos" | "kaduna" | "kano" | "lagos" | "portHarcourt";

const CITY_FIGURES: Record<PlaceIllustrationName, ({ pen }: { pen: Pen }) => React.ReactElement> = {
  jos: JosMark,
  abuja: AbujaMark,
  lagos: LagosMark,
  kaduna: KadunaMark,
  kano: KanoMark,
  ibadan: IbadanMark,
  enugu: EnuguMark,
  portHarcourt: PortHarcourtMark,
};

/** A city we know, keyed by its name with anything that is not a letter dropped. */
const CITY_NAMES: Record<string, PlaceIllustrationName> = {
  jos: "jos",
  abuja: "abuja",
  lagos: "lagos",
  kaduna: "kaduna",
  kano: "kano",
  ibadan: "ibadan",
  enugu: "enugu",
  portharcourt: "portHarcourt",
};

function placeIllustrationName(city: string): PlaceIllustrationName | undefined {
  return CITY_NAMES[city.toLowerCase().replace(/[^a-z]/g, "")];
}

/** A place mark: the city's own figure where we have one, and a plain one where we do not. */
export function PlaceIllustration({ city, size = 38, style }: { city: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const strokes = pen(true);
  const name = placeIllustrationName(city);
  const Figure = name ? CITY_FIGURES[name] : PlaceMark;
  return <Mark size={size} style={style}>
    <G strokeLinecap="round" strokeLinejoin="round"><Figure pen={strokes} /></G>
  </Mark>;
}

function Mark({ size, style, children }: { size: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">{children}</Svg>
  </View>;
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
});
