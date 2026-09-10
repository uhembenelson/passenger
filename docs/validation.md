# Implementation validation

The following checks passed on the implementation checkout using Bun 1.4.2, Node.js 26.7.0, and Google Chrome on macOS:

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed without dependency changes |
| `bun run typecheck` | Passed for core, Convex backend, Expo app, and Next.js admin |
| Core domain tests | 37 passed |
| Convex security/lifecycle tests | 20 passed |
| Next.js production build | Passed |
| Expo SDK dependency compatibility | Passed |
| Expo web export | Passed |
| Expo iOS JavaScript/Hermes export | Passed |
| Expo Android JavaScript/Hermes export | Passed |
| Playwright against built admin and Expo web | 10 passed |

## Browser coverage

The browser suite ran against the production Next.js server and the static Expo web export, not mocked page components. It covers:

- Admin dashboard rendering, delivery search, detail modal and Escape dismissal.
- Parcel approval with a required review note and corresponding audit event.
- Member identity review updates.
- External payout recording with reference, note and explicit confirmation.
- External dispute reconciliation, preserving the historical disputed shipment rather than inventing receipt proof.
- Admin navigation at 390px width with no document horizontal overflow.
- Sender/traveller mode switching in one Expo application.
- Declared parcel submission, trip publication and recoverable route-search empty states.
- Sender-generated handover code, confirmation by the assigned traveller, a distinct delivery code, and final traveller confirmation across separate demo personas.

Backend tests use `convex-test` with the actual schema and handlers. They include authorization, role injection, contact-data redaction, trip ownership/capacity, state ordering, persistent failed-proof attempt counters, proof expiry/replay, payment signature/replay checks, immutable checkout pricing, late settlement during disputes and payout restrictions. Payment network responses are mocked.

## Not validated by these checks

- No production or staging Convex deployment was provisioned.
- No real Clerk sign-in, government identity check, Paystack charge, transfer, refund or SMS was executed.
- Native JavaScript/Hermes export is **not** an APK/IPA build or simulator/physical-device test.
- No independent penetration test, regulatory review, insurance validation, load test or comprehensive accessibility audit was performed.
- Screenshots were captured for build artifacts, but the implementation session did not have image-model support for a visual screenshot review.

Before launch, complete `docs/launch-checklist.md` and the outstanding operational integrations in `docs/architecture.md`.

## Reproduce the native bundle checks

```sh
cd apps/mobile
bunx expo export --platform ios --platform android --output-dir /tmp/passenger-native-export
```

See the root README for all other test/build commands and browser server setup.
