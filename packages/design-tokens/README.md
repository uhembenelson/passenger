# @passenger/design-tokens

Shared Passenger design tokens for web and mobile.

## Contents

- `src/tokens.ts` — base, semantic, and component tokens
- `src/css.ts` — root CSS variable export for web surfaces

## Intended usage

- Admin app imports CSS variable output or mirrored values.
- Mobile app imports the TypeScript tokens directly.
- Shared UI primitives should consume semantic tokens first.
