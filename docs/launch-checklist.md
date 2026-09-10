# Launch and acceptance checklist

## Credential-free demo

- [ ] Both apps identify themselves as demo and show no production claim.
- [ ] Admin overview, deliveries, verification, package review, payments, disputes and audit views are navigable.
- [ ] Filters/search affect visible deliveries; empty results explain how to recover.
- [ ] Admin can approve a pending parcel with a review note and see an audit entry.
- [ ] A payout/refund action clearly records an **external** transaction and requires its reference.
- [ ] Mobile switches between sending and travelling without a second account.
- [ ] Mobile creates a package declaration and a future journey with validation.
- [ ] Demo proof/payment simulations are labelled and never call live services.
- [ ] Reloading resets demo mutations; admin and mobile demo instances do not synchronize.

## Live staging setup

- [ ] Configure a single Clerk application and a single Convex deployment for both apps.
- [ ] Configure the Clerk JWT template `convex`; confirm unauthenticated users cannot write.
- [ ] Provision initial admin via server environment, not from signup.
- [ ] Register sender and traveller; observe pending verification; admin reviews using documented evidence procedures outside the app.
- [ ] Sender declares package and admin reviews contents. Confirm no matching before approval.
- [ ] Traveller publishes journey; confirm mismatched route, insufficient capacity, elapsed departure, self-delivery and underpriced fee are rejected.
- [ ] Accept compatible shipment once; concurrent/repeated accepts must not overbook.
- [ ] Initialize Paystack test payment as sender. Confirm payment return URL alone cannot fund a shipment.
- [ ] Send valid and invalid test webhooks; confirm signature, currency, amount and reference checks; repeat a valid webhook and verify idempotency.
- [ ] Request sender handover code; confirm only assigned traveller can consume it. Wrong codes must exhaust the attempt budget even when UI reports an error.
- [ ] Confirm expired/replayed codes cannot advance shipment state.
- [ ] Generate separate delivery code and privately send it to the receiver. Receiver releases it after collection; traveller consumes it once.
- [ ] Record payout only after verified receipt; open dispute before payout and verify it freezes reconciliation.
- [ ] Verify member queries redact other receivers' names and phone numbers; verify private proof hashes are never returned.
- [ ] Confirm live outages/configuration errors show errors and do not fall back to demo data.

## Before public access

- [ ] Complete all production decisions in `docs/architecture.md`.
- [ ] Test iOS/Android on physical devices; test keyboard/screen-reader access and small screens.
- [ ] Introduce identity evidence and inspection records, recipient notifications, journey changes/cancellation, exact pickup locations, and support escalation.
- [ ] Implement payment timeout/recovery, safe external refund/transfer automation, payment-dispute reconciliation and webhook observability.
- [ ] Apply rate limits and pagination, scoped admin permissions, MFA and access review; arrange independent security review.
- [ ] Publish prohibited items, liability/insurance, privacy, retention and dispute policies; obtain legal review for Nigerian operations.
