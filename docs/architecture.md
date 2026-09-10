# Passenger architecture

Passenger connects senders with verified people travelling along the same route. It does not operate a fleet. A single mobile account can both send packages and publish journeys; there is no permanent sender/traveller role. Administrators use a separate interface against the same backend.

## Workspace boundaries

- `apps/mobile`: Expo SDK 57, React Native, sender/traveller experience.
- `apps/admin`: Next.js App Router, trust and safety operations.
- `packages/backend`: Convex schema, authenticated queries, mutations, actions, HTTP payment webhook.
- `packages/core`: shared DTOs, validation, lifecycle rules, route matching, and clearly fictional demo fixtures.

Apps import typed Convex function references from the backend workspace. Neither app talks directly to the other's server. Convex is the authoritative source of account verification, permissions, match capacity, payment state, delivery proofs, and audit events. Clerk handles authentication; a verified sign-in is **not** a verified traveller identity.

## Delivery lifecycle

```text
package declaration
    ↓
pending_review ── admin rejects ──→ cancelled
    ↓ admin approves declared contents
open
    ↓ verified traveller accepts on a compatible future trip
matched
    ↓ authenticated payment-provider confirmation
funded
    ↓ traveller submits sender's one-time handover code
in_transit
    ↓ traveller submits receiver's one-time receipt code
delivered
    ↓ admin reconciles an external payout
paymentStatus = released
```

An eligible participant may open a dispute. Disputes stop ordinary delivery progression and freeze payout. Admin resolution must include an investigation note and, where money moved externally, a transaction reference. A delivered state means receipt was confirmed, not that the traveller has been paid.

Before matching, the backend checks identity verification, declared-contents approval, route direction, departure time, available capacity, sender/traveller separation, and fee coverage. Capacity is reserved transactionally, not optimistically in the app. City matching is case-insensitive and trimmed, not geospatial routing; matching cities does not establish precise pickup addresses.

## Proofs and tracking

Handover and receipt use separate expiring one-time codes. The sender requests the relevant code; the traveller submits it. The sender must privately pass the delivery code to the receiver, who releases it **only after inspecting and collecting the parcel**. This is a deliberate MVP integration boundary: automated recipient SMS, recipient authentication, and independent receiver proof need a provider and additional implementation. The prototype does not pretend a sender-issued code independently verifies the recipient's identity.

The UI tracks timestamped delivery milestones. It does **not** claim continuous GPS tracking. The backend stores proof hashes rather than plaintext codes, bounds attempts, and logs events without proof secrets.

## Trust boundary

- Browser/native input is untrusted; all operational rules run in Convex.
- Admin rights derive from a server-controlled Clerk-subject allowlist, not a signup field or client role toggle.
- Profile registration does not grant traveller verification.
- Contents approval and identity verification are manual operational decisions. This version does not integrate government-ID checks, biometric checks, document evidence storage, scanning, or physical inspection tooling.
- Public market listings must redact receiver contact details. Participant and admin views have different data access.
- Client code cannot mark a payment funded or directly change arbitrary statuses.
- Demo state is local and visibly labelled; it never writes to Convex and is not a fallback for live authentication/query failure.

## Money boundary

Amounts are whole Nigerian naira in the domain and converted to integer kobo at the Paystack boundary. Delivery fees are calculated server-side from route distance and parcel category. Declared value is distinct from the delivery fee and is not a promise of insurance.

Payment initialization is server-side and provider confirmation is signature-verified, reference/amount/currency-checked, and idempotent. A `held` state is **an application accounting hold on traveller payout**, not regulated escrow. Paystack collection settles under the configured merchant account's arrangement. Payout/refund reconciliation records an external operation; this version does not initiate transfers or refunds.

## Production decisions still required

1. Payment-provider contract and lawful safeguarding/settlement model; reconciliation, chargebacks, provider retry/recovery, refund and payout execution.
2. Identity-provider onboarding, evidence retention, sanctions/fraud checks, and admin MFA/least-privilege roles.
3. Prohibited goods policy, physical inspection procedure, declared-value limits, insurance/liability and dispute SLAs.
4. Receiver notification/authentication, secure proof delivery, abuse controls and customer support.
5. Precise pickup/drop-off details, optional location permissions, privacy controls, messaging, notifications, and journey cancellation/rescheduling.
6. Nigeria Data Protection Act compliance, consent, retention/deletion, incident response, and access reviews.
7. Production pagination, rate limits, observability, deployment monitoring, backup/recovery, and load/accessibility/device testing.

Do not advertise the prototype as insured, government-ID verified, escrow-protected, or live-GPS tracked without implementing and validating those capabilities.
