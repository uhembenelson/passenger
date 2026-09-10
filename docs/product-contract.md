# Passenger live product contract

Implementation target for the live-only iteration. Decisions are product defaults, not claims that credentials, legal approval or external onboarding exist.

## Core product rules

1. One member may send and travel; no permanent role split. Admin is server-allowlisted. Suspension blocks new business while preserving access to active delivery/support records.
2. Identity submission includes name, phone, document type and private evidence uploaded to Convex storage; manual reviewer verifies or rejects with explanation. Changes to reviewed identity require re-review. Rejected submissions are resubmittable. Admin cannot self-review.
3. Package declarations include exact pickup/drop-off meeting instructions (participants/admin only), receiver name/phone, contents/category, weight/value/fee, ready time and delivery deadline, photo evidence and safety consent. Rejection retains an editable/resubmittable parcel, not a fabricated cancellation. No prohibited category bypass; physical inspection still necessary at handover.
4. Trips have ordered origin, optional intermediate stops, destination, departure and arrival estimates, capacity and per-kg minimum rate. Segment matching requires ordered pickup before drop-off; maximum reserved weight on overlapping legs cannot exceed total capacity. Capacity on disjoint legs is reusable. Price/route edits are prohibited after commitments; cancellation handles every linked booking transactionally.
5. Travellers propose an offer for an approved open parcel on their own compatible trip, with fee and expiry. Sender accepts one offer; acceptance atomically verifies identities, route/time/value/weight/fee, rejects other offers and reserves segment capacity. Sender cannot carry their own parcel. No reservation merely for browsing/proposing.
6. Accepted unpaid bookings have a bounded pay-by deadline. Offers expire, unpaid reservations expire/reopen safely, missed handovers flag exceptions, and past journeys stop matching. Server jobs own expiry; clients derive countdowns only for display.
7. Fee quote is server-owned, whole naira input/integer kobo provider accounting; show gross, platform fee and traveller net before offer acceptance. Default platform fee 10% of gross, stated explicitly. No internal wallet or escrow claim.
8. Provider checkout is idempotent; signed provider webhook and independent verification own payment confirmation. Abandoned or late callbacks must never create funded cancelled parcels: record late funds for refund/reconciliation. Never reset an uncertain reference and charge again blindly.
9. Handover: sender-generated expiring code shared only at physical inspection. Traveller must attest contents/condition match. Delivery: code sent to receiver phone via server SMS provider, never returned to sender/traveller. Incorrect attempts commit, retries are throttled, codes expire and cannot replay. Missing provider fails clearly.
10. Delivery records milestone timestamps and coordination notes, not pretend GPS. Participant-only messages and in-app notifications support handover and incidents. Receiver name/phone, meeting points, identity evidence and proof secrets are not public marketplace data.
11. Delivered parcels enter a 24-hour dispute window before payout eligibility. Participant disputes freeze payout/refund operations; admin can request information, resume eligible delivery, cancel an unpaid case, or approve refund/release with reason. Resolved states remain truthful about whether proof happened.
12. Payout requires verified bank details/recipient code, provider-paid funds, receipt or explicit admin adjudication, elapsed dispute window and no open dispute. Transfers/refunds use real Paystack actions with idempotency and signed status events; failed/uncertain operations stay visible and retry/reconcile safely. External manual reconciliation may remain an explicitly audited fallback, never a simulated transfer.
13. Reviews after completed delivery are one per eligible participant/parcel, not editable reputation farming. Ratings and successful-delivery counts are derived from actual records.
14. All new member UI is live-only: configuration → auth → onboarding → identity required/pending/rejected/suspended → ready. Every query has loading, empty, error/offline and permission states; mutations show busy/error/success without false success.
15. Admin has real overview, deliveries/review, trips/offers, identity cases, disputes, finance exceptions and audit. Buttons reflect backend capabilities and readiness, not generic optimistic status changes.

## Implementation coordination

The backend/domain owner defines final shared DTOs in `packages/core` and communicates exact API contracts to mobile/admin owners. Existing API names should stay compatible where safe; new endpoints should be domain-specific. `marketplace.matchShipment` must not retain an unsafe bypass around sender acceptance; remove or make it create an offer.

Suggested API namespaces: accounts (profile/identity), evidence (upload/access), marketplace (dashboard/shipment CRUD), journeys (trip lifecycle), offers (propose/accept/decline/withdraw), deliveries (codes/milestones), conversations (participant messaging), notifications (read), reviews (post-delivery reputation), admin (review/suspension/disputes/ops), payments/finance (provider operations), maintenance (expiry cron).

No production demo switch, fixture export, simulated funding/review, or hidden auth bypass is allowed. Test-only fixtures belong under tests and exercise real Convex handlers. No credentials may be committed or inferred. Existing local development data must not be deleted; prefer backward-compatible optional fields/default projection and explicit migration documentation.
