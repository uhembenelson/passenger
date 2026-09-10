# Passenger design system v1

## Purpose

This document defines the first shared design-system foundation for Passenger so the existing `apps/mobile` and `apps/admin` surfaces can converge on one evolving visual language instead of maintaining separate local styles.

The immediate goal is not a full rebrand rollout in one pass. The goal is to:

1. extract stable primitives from the provided design screens,
2. normalize them into reusable tokens,
3. make those tokens consumable by both React Native and Next.js,
4. create a safe migration path from current styles to the new system.

## Source inputs

This v1 is based on:

- the provided design screens for buttons, inputs, color palette, and typography,
- the current admin CSS variables in `apps/admin/app/globals.css`,
- the current mobile UI primitives in `apps/mobile/src/ui.tsx`.

## Design direction observed from the new screens

### Brand character

The proposed system is:

- calm,
- lightweight,
- high-trust,
- soft but operational,
- green-led with muted neutrals.

That aligns well with Passenger's product tone: movement, reliability, safety, and human coordination.

### Primary visual patterns

From the screens, the system leans on:

- a vivid green primary action,
- very light cool background surfaces,
- dark neutral text rather than pure black,
- low-contrast borders,
- pill and rounded controls,
- restrained typography,
- sparse, product-style spacing.

## Recommended token model

Use three layers:

### 1. Base tokens

Raw shared scales and brand values.

Examples:

- raw colors,
- spacing scale,
- radius scale,
- font sizes,
- font weights.

### 2. Semantic tokens

Meaning-based aliases used by product UI.

Examples:

- `color.background.app`,
- `color.text.primary`,
- `color.action.primary.bg`,
- `color.border.subtle`.

### 3. Component tokens

Component-specific mappings for controls that have stable behavior.

Examples:

- button heights,
- input border widths,
- button radius,
- focus ring color,
- disabled opacity.

This keeps the system scalable and lets the brand evolve without forcing mass component rewrites.

## Initial v1 token decisions

## Color system

### Brand greens

The supplied palette suggests one core green family moving from pale mint to deep forest.

Recommended brand ramp:

- `green.50` → very light mint backgrounds
- `green.100` → subtle fill / soft hover
- `green.200` → borders / selected-soft states
- `green.300` → subdued accents
- `green.400` → secondary emphasis
- `green.500` → primary brand green
- `green.600` → pressed / stronger action
- `green.700` → dark accent
- `green.800` → deep brand support
- `green.900` → near-black green

### Neutral system

The screens show a light grey-lilac background plus soft greys for surface and border. For implementation, keep neutrals semantic instead of overfitting to a tinted mock background.

Recommended neutral ramp:

- `neutral.0` → white
- `neutral.25` → app background
- `neutral.50` → soft surfaces
- `neutral.100` → subtle borders
- `neutral.200` → stronger borders
- `neutral.500` → muted text
- `neutral.700` → secondary heading/body
- `neutral.900` → primary text

### Feedback colors

The current product already uses status colors. Preserve the semantic structure, but normalize names:

- success
- warning
- danger
- info

Each should support at minimum:

- foreground,
- background-soft,
- border,
- emphasis.

## Typography system

The typography screen suggests Work Sans as the primary family.

### Recommended font families

- Primary: `Work Sans`
- Fallback web stack: `Arial, Helvetica, sans-serif`
- Fallback native stack: platform default sans if Work Sans is not installed yet

### Recommended type roles

- `heading.display`
- `heading.h1`
- `heading.h2`
- `heading.h3`
- `body.lg`
- `body.md`
- `body.sm`
- `body.xs`
- `label.md`
- `label.sm`

### Initial sizes from supplied screen

- Heading 1 mobile/app: 24 / medium
- Heading 1 web: 28 / semibold
- Heading 2: 20 / medium
- Heading 3: 18 / regular
- Body large: 18 / regular
- Body medium: 16 / regular
- Body small: 14 / regular
- Body xsmall: 12 / regular
- Button / label: 14 / medium

### Practical implementation note

For the current codebase, maintain a shared token value and allow web/mobile usage rules to map to slightly different roles where necessary. Example: `heading.h1` can stay 24 in app flows while admin dashboard hero headings may use 28.

## Spacing system

Use a compact 4px base scale that supports both mobile and dashboard layouts.

Recommended spacing tokens:

- `space.0 = 0`
- `space.1 = 4`
- `space.2 = 8`
- `space.3 = 12`
- `space.4 = 16`
- `space.5 = 20`
- `space.6 = 24`
- `space.7 = 28`
- `space.8 = 32`
- `space.10 = 40`
- `space.12 = 48`
- `space.14 = 56`
- `space.16 = 64`

This aligns closely with the existing app styles while cleaning up one-off values.

## Radius system

The supplied controls are soft and rounded, often pill-like.

Recommended radii:

- `radius.xs = 6`
- `radius.sm = 8`
- `radius.md = 10`
- `radius.lg = 12`
- `radius.xl = 16`
- `radius.2xl = 20`
- `radius.pill = 999`

## Border and focus system

Recommended border widths:

- `border.width.none = 0`
- `border.width.sm = 1`
- `border.width.md = 2`

Recommended focus behavior:

- use a visible green focus ring,
- ensure contrast against pale backgrounds,
- do not rely on opacity-only state changes.

## Shadow system

The provided screens are mostly flat. Keep shadows minimal.

Recommended shadows:

- `shadow.none`
- `shadow.sm` for cards/modals only
- `shadow.md` for elevated overlays if needed

## Component guidance

## Buttons

### Variants

Start with:

- primary
- secondary
- ghost
- danger

### Sizes

Start with:

- small
- medium
- large

### Recommended behavior

- primary: green fill, white text
- secondary: white or background fill, green border/text
- ghost: transparent background, green text
- disabled: reduced contrast but still legible
- focus: visible ring
- pressed: darker fill or subtle opacity plus elevation stability

### Shape

The design screens suggest pill treatment for core CTA buttons. For v1:

- large CTA buttons: `radius.pill`
- smaller utility buttons: `radius.pill` or `radius.lg`

## Inputs

### Variants visible in the supplied screen

- default
- active/focused
- placeholder-filled
- password with trailing icon
- select with trailing icon

### Recommended input rules

- label sits above field,
- input background stays very light,
- border is subtle by default,
- active state uses green stroke,
- placeholder uses muted text token,
- icons inherit semantic muted/action color,
- error and success variants can be added after base adoption.

## Surface and text roles

Recommended semantic roles:

- `background.app`
- `background.surface`
- `background.subtle`
- `text.primary`
- `text.secondary`
- `text.tertiary`
- `text.onPrimary`
- `border.subtle`
- `border.strong`

## Migration plan for the existing repo

## Phase 1: shared tokens package

Create a dedicated token package in `packages/design-tokens` with:

- raw/base tokens,
- semantic aliases,
- component tokens,
- web CSS variable export,
- TypeScript export for React Native and Next.js.

## Phase 2: admin adoption

Replace direct values in `apps/admin/app/globals.css` with token-derived CSS variables.

Priority areas:

1. root colors,
2. typography roles,
3. border radius,
4. button patterns,
5. form controls,
6. status/feedback colors.

## Phase 3: mobile adoption

Replace `colors` and hard-coded shared UI values in `apps/mobile/src/ui.tsx` with imports from the token package.

Priority areas:

1. color object,
2. text roles,
3. button sizing,
4. field styling,
5. card/sheet/badge primitives.

## Phase 4: component parity

Create equivalent definitions for:

- buttons,
- fields,
- cards,
- notices,
- badges/status chips,
- modal/sheet containers.

## Naming recommendations

Prefer stable, readable names over tool-specific naming.

Examples:

- `color.brand.primary`
- `color.background.app`
- `color.text.primary`
- `color.text.muted`
- `space.4`
- `radius.pill`
- `font.size.body.md`
- `component.button.height.md`
- `component.input.height.md`

Avoid names tied to one screen mock like:

- `mint1`
- `grey2`
- `buttonGreenFinal`

## Initial adoption rules

1. New UI should consume tokens before introducing new hard-coded values.
2. Existing screens do not need immediate full refactor.
3. Shared primitives should migrate before leaf screens.
4. Semantic tokens should be preferred in app code; raw palette values should stay mostly inside the token package.
5. Accessibility adjustments are allowed where the provided designs are too light for production use.

## What v1 does not solve yet

This first version does not fully define:

- dark mode,
- data-visualization color rules,
- motion tokens,
- z-index layering scale,
- complete form validation state system,
- full iconography rules,
- exhaustive responsive layout tokens.

Those can be added after the first shared token adoption lands.

## Immediate next implementation step

Adopt the shared token package in both apps without changing every screen at once:

1. create the shared token source,
2. export CSS variables for admin,
3. export TypeScript token objects for mobile,
4. refactor the common button and field primitives first.
