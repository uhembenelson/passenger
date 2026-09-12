# Passenger shared Convex backend

Shared, strictly typed backend for Next/admin and Expo/mobile. Convex **1.45.0**; DTOs, route matching, validation and normal shipment transitions come from `@passenger/core`. TypeScript follows the workspace's Expo-compatible `~6.0.3`.

## Local checks and deployment

From this directory, after installing the root workspace dependencies:

```sh
bun run typecheck
bun run test
bun run dev
```

`convex dev` requires your own Convex deployment/login. No deployment or live payment was performed while building this package. The checked-in `_generated/api.ts`, `server.ts`, and `dataModel.ts` are standard typed schema/`ApiFromModules` shims; `convex dev` replaces them with normal deployment codegen. They do not claim that a backend has been deployed.

Configure a Clerk JWT template named **convex**, with audience `convex`, and set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment. Include the Clerk email claim if payments will be enabled. `ADMIN_CLERK_SUBJECTS` is a comma-separated server-only allowlist of exact Clerk subject IDs. No client claim, profile argument, stored role, seed endpoint, or email address grants administrator privileges. Use two independent reviewers when an admin also participates: administrators cannot review their own identity/packages or reconcile their own payouts/disputes.

See `.env.example`. `convex env set NAME value` or the Convex dashboard configures the **deployment's** environment; a local `.env` alone does not configure deployed functions. Do not commit secrets. Set optional `PAYSTACK_SECRET_KEY` and `PAYSTACK_CALLBACK_URL` (HTTPS only). Register `https://YOUR_DEPLOYMENT.convex.site/paystack/webhook` in Paystack. Client providers use the `.convex.cloud` URL, not the HTTP webhook URL. Configure sandbox Paystack keys first; this package never manufactures payment success.

## Public API

| Function | Kind | Result |
| --- | --- | --- |
| `accounts.ensureProfile({ name, phone })` | mutation | core `Person` |
| `marketplace.dashboard({})` | query | core `DashboardSnapshot` |
| `marketplace.createShipment(CreateShipmentInput)` | mutation | shipment ID |
| `journeys.create(CreateTripInput)` | mutation | trip ID |
| `marketplace.createTrip(CreateTripInput)` | mutation | trip ID (compatibility alias) |
| `marketplace.matchShipment({ shipmentId, tripId })` | mutation | void |
| `marketplace.cancelShipment({ shipmentId })` | mutation | void |
| `deliveries.issueCode({ shipmentId, kind })` | action | `{ code: string }` |
| `deliveries.confirmHandover({ shipmentId, code })` | action | void |
| `deliveries.confirmDelivery({ shipmentId, code })` | action | void |
| `deliveries.raiseDispute({ shipmentId, reason })` | mutation | dispute ID |
| `admin.reviewUser({ userId, decision, note })` | mutation | void |
| `admin.reviewShipment({ shipmentId, decision, note })` | mutation | void |
| `admin.resolveDispute({ disputeId, resolution, note, externalReference })` | mutation | void |
| `admin.recordPayout({ shipmentId, externalReference, note })` | mutation | void |
| `payments.initialize({ shipmentId })` | action | `{ url: string }` |

Review decisions and proof kinds match the agreed core/client contract. Convex IDs remain strings in the core DTOs; use generated `Id<"shipments">`/`Id<"trips">` at typed Convex call sites. Only the explicit public functions above are client callable. Crypto, proof state and settlement writes are internal functions, not public funding endpoints.

## Security and lifecycle

- Unauthenticated/unonboarded dashboard requests return an empty snapshot with `viewer: null`. All writes require trusted authentication; public business writes require a stored profile.
- `ensureProfile` is idempotent and does not overwrite an existing reviewed identity. New profiles are pending; names/phones are validated. Verification is **manual review**, not an integrated identity/KYC provider.
- Members see their own sender/traveller shipments plus open market listings. Nonparticipants receive empty receiver name/phone and zero declared value. Other members' contact phone numbers are not included in `people`. Global audit entries and disputes are not leaked into market listings. Admins see the complete management data.
- Verified members can create shipments/trips. A separate safety approval opens a package. Only a trip's verified traveller can accept another verified sender's approved open shipment. Matching rechecks route, future departure, capacity, category, and the immutable backend-calculated shipment fee. Reservation and shipment state change are one Convex transaction.
- `Trip.capacityKg` in the dashboard is **remaining** capacity; schema stores total and reserved kg separately. Sender cancellation before payment initialization releases reservation exactly once. Delivered/in-transit reservations remain consumed; a pre-handover reconciled refund releases them.
- Paystack checkout amount is the immutable server shipment fee in whole kobo, currency NGN. Server-generated references use 192 bits of cryptographic randomness. Payment initialization does not fund a shipment, and revisiting the success URL does not fund it either.
- Webhooks verify the exact raw-body HMAC-SHA512 signature with constant-time comparison, then independently call Paystack's transaction verification endpoint. Amount, NGN currency, reference, transaction ID and shipment state must match. Atomic settlement is idempotent; replay does not create another audit or balance transition. A paid callback during a dispute records the funds without lifting the dispute freeze.
- **Held means provider-paid awaiting external reconciliation; it is not regulated escrow.** This package has no transfer, payout or refund API and no internal wallet. Admin payout/refund actions record an already completed external operation using a unique reference and a note. They do not move money. Disputes freeze proof and ordinary payout operations. Ordinary payout recording requires delivery proof first.
- Sender-only issuance returns an eight-digit Node `crypto.randomInt` code, storing only a shipment/kind-bound SHA-256 hash. Codes expire after ten minutes, permit five attempts, require a minute between issuances and allow at most three issuances per hour/kind. Reissuing invalidates the prior code. Failed attempts commit before the public action throws; retries cannot roll back the rate counter. Code plaintext is never written to application audits or shipment records.
- The sender hands over the handover code only at physical handover. For final delivery, the **sender relays the delivery code directly to the receiver**, who gives it to the traveller only after receipt. A traveller can confirm, never retrieve either proof. Funding, role and lifecycle are checked transactionally for each consumption; successful proofs cannot be replayed.
- Every production write path includes an append-only application audit in the same transaction. No public audit update/delete function is exposed. All dashboard DTOs are explicitly projected; Clerk subjects, proof hashes, counters, provider URLs and internal payment rows are never dumped to clients.

## Deliberate limitations / operator responsibilities

- An initialized/uncertain payment cannot be casually cancelled or reset: a late successful charge may still arrive. Retry uses the same reference. If initialization reached the provider but its response was lost, an operator may need to reconcile the provider state before proceeding. There is deliberately no unsafe “mark paid,” “reset payment,” or mock funding button.
- `resolveDispute` currently requires provider-confirmed held funds. Unpaid disputed shipments, including uncertain provider initialization, require operational support; this MVP does not implement provider-failure/abandonment adjudication. Do not promise a self-service resolution for those cases.
- Resolving a funded dispute closes the `Dispute` and reconciles its payment, but preserves shipment status `disputed` as a historical exception. It does not fabricate a delivered lifecycle event. After external release/refund, further claims must be handled by support rather than reopening a payment already reconciled.
- Refund/release choices are trusted administrative attestations of external evidence. This package does not verify bank refund/payout references remotely and does not itself enforce a settlement delay or two-person approval for every payout.
- Manual verification/safety review notes are not identity evidence storage, sanctions screening, insurance, a carrier license or a legal compliance determination. Establish out-of-band review, liability, forbidden-goods and provider onboarding processes before launch.
- Snapshot collections are unpaginated for a pilot; audit display is limited to the latest 200 entries. Add pagination, retention policy, observability and load testing before operating at scale. Exact issuer/audience configuration, Clerk claims, deployed Node actions and provider callbacks must be exercised against a real staging deployment before launch.

## Tests

`tests/security.test.ts` uses `convex-test` with the real schema, functions and transactional operations. Tests cover anonymous/member/admin authorization, role injection, verification, DTO privacy, trip ownership/route/time/fee/capacity, cancellation replay, unfunded/unauthorized proof access, code hashing, expiry, persistent attempt locks, reissuance throttling, proof sequencing/replay, exact payment reconciliation, signed/forged/replayed webhooks, dispute freezing, delayed settlement, external payout recording, checkout pricing/idempotence and fail-closed missing payment configuration. Network calls are mocked; tests are not evidence of real provider/deployment connectivity.

## SMS and email delivery

Termii sends phone verification codes, receiver delivery codes, and parcel status messages. Set `TERMII_API_KEY` and an approved `TERMII_SENDER_ID` on the Convex deployment. Set `TERMII_BASE_URL` to the API base URL shown in your Termii dashboard, defaulting to `https://api.ng.termii.com`. `TERMII_CHANNEL` defaults to `generic`; use `dnd` if your account has that route approved. Fund the Termii account before testing delivery.

Phone OTPs are six cryptographically random digits, expire after ten minutes, and are never returned to the app. The server enforces a 63-second resend interval and five guesses per code. When either Termii credential is missing, phone OTP is skipped and phone numbers can be saved without a verification timestamp. The app hides the phone verification gate. Configuring Termii enables verification again for those numbers. There is no preview-code fallback. Delivery proof SMS still requires Termii. Termii transports the codes through its messaging API; Passenger verifies and consumes them. A successful API response means the provider accepted the message, not that the handset received it.

Resend sends branded signup verification and password-reset emails with both HTML and plain text. When both `RESEND_API_KEY` and `AUTH_EMAIL_FROM` are set, signup requires the emailed code before creating a session. If either is missing, signup and login skip email verification without marking the email verified. Password resets still require Resend. Provider delivery failures do not bypass verification. Unverified accounts receive a new code when logging in, and the app supports resending and entering that code. Verification codes expire after ten minutes and cannot be reused. Set `SITE_URL` to the public Passenger app URL used by the email button. Set `RESEND_API_KEY` and `AUTH_EMAIL_FROM`, for example `Passenger <accounts@your-verified-domain.com>`, on the Convex deployment. Verify that domain and its DNS records in Resend. Test-mode senders can only send to the addresses Resend permits.

Secrets belong in the Convex dashboard or `convex env set`, never in `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variables. Deploy the backend and updated mobile client together because phone confirmation now uses a Convex action. Test SMS receipt and password-reset email receipt on staging with accounts you control after configuring the providers. Automated tests mock delivery and do not send messages.
