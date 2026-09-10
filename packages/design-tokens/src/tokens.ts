export const primitives = {
  color: {
    white: "#FFFFFF",
    black: "#000000",
    green: {
      50: "#EAF5F0",
      100: "#D8EEE4",
      200: "#BCE2D1",
      300: "#98D7BA",
      400: "#63CF9A",
      500: "#34D186",
      600: "#2FA968",
      700: "#248A56",
      800: "#175C38",
      900: "#062A16"
    },
    neutral: {
      0: "#FFFFFF",
      25: "#F5F4F7",
      50: "#F7F7F8",
      100: "#E5E7EB",
      200: "#D1D5DB",
      500: "#7A7F87",
      700: "#4B5563",
      800: "#1F2937",
      900: "#2D362F"
    },
    red: {
      100: "#F9DFDA",
      500: "#FF3B30",
      700: "#C8342B"
    },
    yellow: {
      100: "#EEE8D3",
      500: "#F5C400",
      700: "#B58C00"
    },
    blue: {
      100: "#D4DFEB",
      500: "#1677E6",
      700: "#0F5EB7"
    }
  },
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    10: 40,
    12: 48,
    14: 56,
    16: 64
  },
  radius: {
    xs: 6,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16,
    "2xl": 20,
    pill: 999
  },
  borderWidth: {
    none: 0,
    sm: 1,
    md: 2
  },
  opacity: {
    none: 0,
    disabled: 0.45,
    pressed: 0.82
  },
  typography: {
    family: {
      sans: "var(--font-work-sans), Work Sans, Arial, Helvetica, sans-serif",
      sansRaw: "Work Sans, Arial, Helvetica, sans-serif",
      native: {
        regular: "WorkSansRegular",
        medium: "WorkSansMedium",
        semibold: "WorkSansSemiBold"
      }
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600
    },
    size: {
      headingH1Web: 28,
      headingH1: 24,
      headingH2: 20,
      headingH3: 18,
      bodyLg: 18,
      bodyMd: 16,
      bodySm: 14,
      bodyXs: 12,
      button: 14,
      labelMd: 14,
      labelSm: 12
    },
    lineHeight: {
      headingH1Web: 34,
      headingH1: 30,
      headingH2: 28,
      headingH3: 26,
      bodyLg: 28,
      bodyMd: 24,
      bodySm: 20,
      bodyXs: 16,
      button: 20,
      labelMd: 20,
      labelSm: 16
    }
  },
  shadow: {
    none: "none",
    sm: "0 2px 8px rgba(17, 24, 39, 0.06)",
    md: "0 8px 24px rgba(17, 24, 39, 0.10)"
  }
} as const;

export const semantic = {
  color: {
    brand: {
      primary: primitives.color.green[500],
      primaryHover: primitives.color.green[600],
      primaryStrong: primitives.color.green[700]
    },
    background: {
      app: "#EADCDC",
      surface: primitives.color.neutral[0],
      subtle: primitives.color.neutral[50],
      successSoft: primitives.color.green[50],
      dangerSoft: primitives.color.red[100],
      warningSoft: primitives.color.yellow[100],
      infoSoft: primitives.color.blue[100]
    },
    text: {
      primary: primitives.color.neutral[900],
      secondary: primitives.color.neutral[700],
      tertiary: primitives.color.neutral[500],
      onPrimary: primitives.color.white,
      success: primitives.color.green[700],
      danger: primitives.color.red[700],
      warning: primitives.color.yellow[700],
      info: primitives.color.blue[700]
    },
    border: {
      subtle: primitives.color.neutral[100],
      strong: primitives.color.neutral[200],
      action: primitives.color.green[400],
      focus: primitives.color.green[500],
      danger: primitives.color.red[500]
    }
  }
} as const;

const mediumControlHeight = 44;

export const components = {
  button: {
    height: {
      sm: 36,
      md: mediumControlHeight,
      lg: 56
    },
    paddingX: {
      sm: primitives.space[3],
      md: primitives.space[4],
      lg: primitives.space[6]
    },
    radius: primitives.radius.pill
  },
  input: {
    height: {
      md: mediumControlHeight,
      lg: 48
    },
    radius: primitives.radius.lg,
    borderWidth: primitives.borderWidth.sm
  },
  icon: {
    size: {
      sm: primitives.typography.size.bodyMd,
      md: primitives.typography.size.headingH2,
      lg: primitives.typography.size.headingH1
    },
    strokeWidth: {
      regular: primitives.borderWidth.md,
      strong: 3
    }
  },
  iconButton: {
    size: primitives.space[12],
    hitSlop: primitives.space[2],
    pressRetentionOffset: primitives.space[5]
  },
  card: {
    background: semantic.color.background.surface,
    radius: primitives.radius.xl,
    padding: primitives.space[6],
    borderWidth: primitives.borderWidth.sm,
    borderColor: semantic.color.border.subtle,
    shadowColor: "#111827",
    shadowOpacity: 0.06,
    shadowRadius: primitives.space[2],
    shadowOffsetY: primitives.space[1] / 2,
    elevation: 1
  },
  journeyCard: {
    stackGap: primitives.space[4],
    radius: primitives.radius.xl,
    borderWidth: primitives.borderWidth.none,
    paddingX: primitives.space[4],
    paddingY: primitives.space[6],
    shadowOpacity: 0.02,
    routeEndGap: primitives.space[2],
    routeLabelSize: primitives.typography.size.bodySm,
    routeLabelLineHeight: primitives.typography.lineHeight.bodySm,
    citySize: primitives.typography.size.headingH2,
    cityLineHeight: primitives.typography.lineHeight.headingH2,
    arrowSize: mediumControlHeight,
    arrowRadius: mediumControlHeight / 2,
    arrowIconSize: primitives.typography.size.headingH2,
    arrowStrokeWidth: primitives.borderWidth.md,
    arrowBackground: "#A8EBCF",
    arrowForeground: "#168B61",
    dividerMarginTop: primitives.space[7],
    dividerMarginBottom: primitives.space[6],
    dateSize: primitives.typography.size.bodySm,
    dateLineHeight: primitives.typography.lineHeight.bodySm,
    actionHeight: mediumControlHeight,
    actionMarginTop: primitives.space[5]
  },
  actionSheet: {
    maxHeight: "88%",
    background: semantic.color.background.app,
    radius: primitives.space[6],
    handleWidth: mediumControlHeight,
    handleHeight: primitives.space[1] + 1,
    handleRadius: primitives.radius.xs,
    handleMarginTop: primitives.space[3] - 2,
    handleMarginBottom: primitives.space[2] - 2,
    paddingX: primitives.space[5],
    headerPaddingBottom: primitives.space[4],
    bodyPaddingBottom: primitives.space[7] + 2,
    contentGap: primitives.space[4],
    sectionGap: primitives.space[3],
    compactGap: primitives.space[2],
    optionGap: primitives.space[7] + 2,
    optionSize: primitives.space[8],
    codePadding: primitives.space[5],
    codeLetterSpacing: primitives.space[2],
    codeSize: primitives.typography.size.headingH1Web + primitives.space[1] + 2,
    shadowOpacity: 0.16,
    shadowRadius: primitives.space[4],
    shadowOffsetY: -primitives.space[2] + 2,
    elevation: 14
  },
  focusRing: {
    width: 2,
    offset: 2
  }
} as const;

export type PassengerDesignTokens = {
  primitives: typeof primitives;
  semantic: typeof semantic;
  components: typeof components;
};
