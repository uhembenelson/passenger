# Passenger

**Good things move with people.** A peer-to-peer delivery MVP for packages travelling with verified people already heading in the right direction. One mobile app serves both senders and travellers; a separate operations dashboard manages trust and safety. Both use the same Convex backend.

## Stack

| Workspace | Technology | Responsibility |
| --- | --- | --- |
| `apps/mobile` | Expo **57**, React Native 0.86, React 19 | Sending, travelling, matching, milestones, handover/receipt proofs |
| `apps/admin` | Next.js 16 App Router | Verification, contents review, delivery oversight, disputes, reconciliation |
| `apps/website` | Next.js 16 App Router | Public marketing website, pricing calculator, trust & safety guide |
| `packages/backend` | Convex 1.45 | Shared database, permissions, state machine, audit, proof codes, Paystack adapter |
| `packages/core` | TypeScript | Shared contracts, validation, routing rules, demo fixtures |
| `packages/design-tokens` | TypeScript / CSS | Shared design tokens, primitives, typography, colors, and shadows |

Bun 1.4.2 workspaces with a committed `bun.lock`, a single shared root `node_modules/`, and hoisted workspace installs via `bunfig.toml`. No separate mobile/backend data model and no permanent sender-versus-traveller account role.

## Quick start: no credentials needed

Install [Bun](https://bun.sh) 1.4.2 or newer and Node.js 22 LTS or newer.

```sh
bun install --frozen-lockfile
bun dev
```

`bun dev` starts the full workspace together from the repository root:
- admin dashboard on `http://localhost:3000`
- Expo app in interactive development mode
- shared Convex backend watcher

`bun run dev:all` is available as an explicit alias for the same full-workspace command.

For Expo, press `w` for web, `i` for iOS simulator, or `a` for Android emulator.

If you want one surface only, these remain available:

```sh
bun run dev:admin
bun run dev:website
bun run dev:mobile
bun run dev:backend
```

If Bun is installed globally but your current shell still says `bun: command not found`, reload your shell first:

```sh
exec /bin/zsh
```

If Bun is still not on your PATH, bootstrap commands with `npm exec --yes --package=bun@1.4.2 -- bun`, for example:

```sh
npm exec --yes --package=bun@1.4.2 -- bun install --frozen-lockfile
npm exec --yes --package=bun@1.4.2 -- bun run dev:all
```

With **both** public service variables absent, each app opens an explicitly labelled, interactive in-memory demo. Demo edits reset on reload and **do not synchronize between apps**. Switching demo personas does not alter production authorization. A partial configuration or live service failure never silently substitutes demo records.

## Connect the shared live backend

### 1. Convex

```sh
cd packages/backend
bunx convex dev
```

Authenticate and create a development deployment. Convex stores its deployment configuration in `packages/backend/.env.local`. Keep `convex dev` running during live development; it deploys functions and refreshes the generated API bindings. The checked-in typed bindings let the monorepo compile before a deployment exists.

### 2. Clerk authentication

Create one Clerk application for both interfaces. Enable email/password sign-in and email verification for the mobile flow. Create a JWT template named **`convex`** from Clerk's Convex template. It must include `aud: "convex"` and an **email** claim for Paystack checkout. Use the Clerk issuer URL from that template (for example `https://your-instance.clerk.accounts.dev`).

Set **server-side Convex environment variables** from `packages/backend`:

```sh
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-instance.clerk.accounts.dev
bunx convex env set ADMIN_CLERK_SUBJECTS user_your_clerk_admin_id
```

For multiple administrators use comma-separated Clerk user IDs. This allowlist is the only source of administrator privilege. Signing up, selecting Travel mode, or writing a client profile does not grant admin rights or identity verification. Admins cannot approve their own identity, packages, or financial reconciliation; use an independent admin when needed.

### 3. App environments

Copy `apps/admin/.env.example` to `apps/admin/.env.local` and `apps/mobile/.env.example` to `apps/mobile/.env.local`.

```dotenv
# apps/admin/.env.local
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

```dotenv
# apps/mobile/.env.local
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Both Convex URLs must identify **the same deployment**. Restart the apps after changing their environments. Use only publishable Clerk keys in the apps; never expose payment secrets or Convex deployment credentials in public environment variables.

Sign in and complete a Passenger profile. All new member profiles are pending manual verification. An allowlisted administrator can sign into the dashboard and review members. Identity/document evidence collection and physical contents inspection remain external operational procedures in this MVP; the dashboard records the decision and note, not an automated KYC result.

### 4. Optional Paystack collection

From `packages/backend`:

```sh
bunx convex env set PAYSTACK_SECRET_KEY sk_test_...
# Optional HTTPS page shown after hosted checkout; it does NOT confirm payment.
bunx convex env set PAYSTACK_CALLBACK_URL https://your-domain.example/payment-return
```

Set the Paystack webhook URL to:

```text
https://your-deployment.convex.site/paystack/webhook
```

Use **`.convex.site`**, not the client **`.convex.cloud`** URL. The handler validates the raw-body HMAC-SHA512 signature, verifies the transaction with Paystack, and checks the immutable reference, NGN currency, and server-calculated amount. Replayed confirmations do not fund twice. The sender cannot fund a shipment directly from a client mutation, and returning from checkout is not proof of payment.

`held` means payment was received by the configured provider and traveller payout has not been reconciled. It is **not regulated escrow**. Admin payout/refund controls record an already completed external operation with a unique transaction reference; they do not transfer money. Do not record one before it has actually happened.

Payment initialization deliberately locks ordinary cancellation to avoid a late paid webhook funding a cancelled shipment. Failed/uncertain initializations and stale departures require operational reconciliation; automatic payment timeout recovery and refund/transfer execution are not implemented. Start with provider test keys, not live collections.

## Implemented workflows

- Switch between Send and Travel in the same app/account.
- Declare route, package contents/category, weight, value, and receiver details; the backend calculates the delivery fee from route distance and parcel category.
- Publish future journeys with capacity and carrying preferences, not a traveller-set price.
- Admin review before marketplace availability; both participants verified before matching.
- Traveller acceptance checks route direction, departure, capacity, parcel category, and self-delivery, with transactional capacity reservation.
- Provider-confirmed payment before handover.
- Separate expiring, attempt-limited, one-time handover and delivery codes; no plaintext code storage in database/audit.
- Sender privately relays the delivery code to the receiver, who releases it only after collection. This is an MVP proof mechanism, not independent receiver identity verification or automated SMS.
- Delivery milestone history, participant disputes, payout freeze, admin external reconciliation, and audit events.
- Member data redaction, allowlisted administrator checks, and no production demo seed or client-set role.

## Validation commands

```sh
bun run typecheck
bun run test                 # Core rules + Convex backend security/lifecycle tests
bun run build:admin
bun run export:mobile        # Expo web bundle; not an iOS/Android binary
bun run check

# Browser tests against a running credential-free admin at port 3000
bunx playwright install chromium
bun run test:e2e
```

You can use an existing Chromium browser with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`, or another running admin URL with `PLAYWRIGHT_BASE_URL`. On macOS, Google Chrome is usually `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

Mobile browser tests are optional by default. To run all browser checks, also serve the mobile export and provide its URL:

```sh
# Separate terminal, after bun run export:mobile
cd apps/mobile/dist
python3 -m http.server 8081 --bind 127.0.0.1

# From the repository root, with both interfaces running
PASSENGER_MOBILE_URL=http://127.0.0.1:8081 bun run test:e2e
```

These browser tests include sender/traveller switching, parcel/trip creation, both one-time-code milestones across separate demo personas, admin reviews, disputes and external payout reconciliation.

CI installs the frozen lockfile, typechecks, tests, builds Next.js, and exports Expo web. Local in-memory backend tests do not replace staging tests against Clerk, Convex, Paystack, and physical phones.

## Status and boundaries

This is an implementation foundation/MVP, **not a production-certified courier or financial service**. Tracking is milestone-based, not background GPS. KYC providers, document/photo evidence, automated recipient SMS, push notifications, exact pickup addresses, messaging, insurance, money movement, journey rescheduling, production pagination/abuse controls and comprehensive native-device testing still require work.

See [`docs/architecture.md`](docs/architecture.md) for security/data boundaries, [`docs/launch-checklist.md`](docs/launch-checklist.md) for demo, staging and production acceptance steps, and [`docs/validation.md`](docs/validation.md) for the checks performed and their limitations.
