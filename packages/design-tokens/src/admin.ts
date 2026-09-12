import { primitives } from "./tokens";

export const adminSemantic = {
  color: {
    brand: {
      primary: primitives.color.green[500],
      sidebar: "#27AB6B",
      sidebarHover: primitives.color.green[700],
      tint: "#BCF0D7",
    },
    background: {
      app: primitives.color.neutral[25],
      surface: primitives.color.white,
      subtle: primitives.color.neutral[50],
      sidebar: "#27AB6B",
      overlay: "rgba(25, 58, 40, 0.36)",
      successSoft: primitives.color.green[50],
      dangerSoft: "#FFF2F2",
    },
    text: {
      primary: "#1F2937",
      secondary: primitives.color.neutral[700],
      tertiary: primitives.color.neutral[700],
      inverse: primitives.color.white,
      sidebar: primitives.color.white,
      sidebarMuted: "#DCE5DC",
      sidebarAccent: "#D9E7B7",
      success: primitives.color.green[700],
      danger: "#B42318",
    },
    border: {
      subtle: primitives.color.neutral[100],
      strong: primitives.color.neutral[200],
      field: "#F3F3F3",
      fieldActive: primitives.color.green[500],
      action: "#BCF0D7",
      successSoft: "#D7EADB",
      dangerSoft: "#F3C7C7",
    },
    status: {
      destructive: "#EF4444",
    },
  },
  shadow: {
    panel: "0 24px 60px rgba(7, 18, 12, 0.20)",
  },
} as const;

export const adminComponents = {
  auth: {
    cardMaxWidth: 520,
    fieldWidth: 342,
  },
  shell: {
    sidebarWidth: 297,
    sidebarCompactWidth: 234,
  },
  input: {
    radius: 12,
    padding: 16,
    iconSize: 24,
  },
  button: {
    radius: 30,
    largePaddingY: 16,
    largePaddingX: 16,
    smallHeight: 43,
    smallPaddingY: 12,
    smallPaddingX: 16,
    smallIconGap: 5,
  },
  nav: {
    groupGap: 30,
    itemGap: 12,
    itemPaddingX: 10,
    itemPaddingY: 10,
    activeRadius: 6,
  },
} as const;

export type PassengerAdminDesignTokens = {
  semantic: typeof adminSemantic;
  components: typeof adminComponents;
};
