# Passenger Marketplace Flow — Implementation Brief

## Objective

Implement Passenger as a two-sided parcel marketplace:

1. A traveller publishes where and when they are travelling and what they can carry.
2. A sender publishes where and when a parcel needs to move and what the parcel contains.
3. Passenger ranks compatible trips and parcels by route, time proximity, capacity, carrying preferences, and price compatibility.
4. A traveller may discover a compatible parcel and send a carry offer.
5. A sender reviews compatible travellers and incoming offers, opens each traveller's profile, and chooses one.
6. A match becomes a booking only after mutual consent. Payment begins only after the sender accepts an offer.

Do not introduce fake booking, wallet, payment, chat, tracking, or success states. Every success state must be backed by the existing Convex data and server-confirmed mutations/actions.

## Current State

The repository partially supports this model:

- Travellers can create trips with an ordered route, departure, arrival, and carrying constraints.
- Senders can create parcels with a route, ready time, delivery deadline, category, weight, value, evidence, and receiver details.
- The core and backend validate ordered route compatibility, timing, segment capacity, identity verification, and backend-calculated fees.
- A traveller can propose an offer from one of their compatible trips.
- A sender can accept or decline incoming offers.
- Accepting an offer reserves trip capacity and opens the real payment step.
- People already expose aggregate rating, review count, and successful-delivery count.

The intended experience is not complete because:

- The mobile Trips screen does not give travellers a first-class way to browse parcels compatible with their trips.
- Trip creation captures total capacity but not the parcel categories, per-parcel limit, or handling preferences the traveller accepts.
- Sender discovery does not collect a preferred pickup date/time plus explicit flexibility and rank results by closeness.
- Current matching is pass/fail within the parcel's full ready-to-deadline window; it does not expose a match score or explain why a result is close.
- The focused offer-review sheet shows the traveller's name, fee, expiry, and note, but not their profile, rating, reviews, completed deliveries, or selected trip details.
- `FindTravellerFlow` contains simulated payment, wallet, and local-only chat states. It does not invoke `onBookTrip`, so that path does not complete a real marketplace action.
- Mobile navigation currently hides the legacy parcel-discovery/offer path used by travellers.
- Review summaries exist, but individual public review comments are not available in the marketplace profile flow.

## Product Rules

### Mutual consent

- A suggested match is not a booking.
- A traveller sends a carry offer tied to one owned trip and one parcel.
- A sender accepts exactly one valid offer.
- Acceptance reserves capacity for the existing payment window.
- Other pending offers are declined by the server.
- No sender payment may start before an offer is accepted.
- A sender must never be able to carry their own parcel.

### Traveller listing

A traveller must provide:

- Origin and final destination.
- Optional ordered intermediate stops.
- Departure date and time.
- Estimated arrival date and time.
- Total available capacity in kilograms.
- Maximum weight allowed for one parcel.
- Accepted parcel categories.
- Optional handling/preferences note.
- Minimum rate per kilogram.
- Existing safety declaration and verified-account requirement.

### Sender listing

A sender must provide:

- Pickup city and destination city.
- Parcel category, description, weight, declared value, and photos.
- Preferred pickup date and time.
- Pickup flexibility before/after the preferred time.
- Latest acceptable delivery time.
- Pickup/drop-off instructions and receiver details.
- No manual delivery fee input. The backend calculates it from route distance and parcel category.
- Existing safety declaration and verified-account requirement.

### Compatibility

A trip is compatible when all of the following are true:

- The parcel route is an ordered segment of the trip route.
- The traveller is verified and active.
- The parcel is approved, open, unpaid, and belongs to another user.
- The trip is active and has not departed.
- Trip departure falls inside the parcel's pickup window.
- Trip arrival is no later than the parcel's delivery deadline.
- The parcel category is accepted by the traveller.
- Parcel weight does not exceed the traveller's per-parcel limit.
- Every overlapping trip leg has enough remaining capacity.
Compatibility rules must be implemented once in shared core logic and rechecked atomically by Convex before an offer is created or accepted. Client filtering is for presentation only and must not authorize a match.

### Match ranking

Return compatible results ordered by a deterministic score. At minimum include:

1. Time difference from the sender's preferred pickup time.
2. Direct route before routes with intermediate stops, when otherwise equal.
3. Traveller rating and successful deliveries.
4. Stable tie-breaker using trip creation/id.

Expose a short explanation such as `2 hours after your preferred pickup`, `direct route`, and `5 kg available`. Do not label a result as compatible unless the server rules also consider it compatible.

## Data Model Changes

Add fields with a safe migration/default strategy:

### `trips`

- `acceptedCategories: string[]`
- `maxParcelWeightKg: number`
- `handlingNotes?: string`

### `shipments`

- `preferredPickupAt: number`
- `pickupFlexBeforeMinutes: number`
- `pickupFlexAfterMinutes: number`

Keep `readyAt` and `deliveryDeadline` during migration. Derive the pickup window as:

```text
pickupWindowStart = preferredPickupAt - pickupFlexBeforeMinutes
pickupWindowEnd   = preferredPickupAt + pickupFlexAfterMinutes
```

For legacy parcels, treat `readyAt` as the window start and derive a conservative preferred time/window end. Do not silently broaden an existing parcel beyond its recorded delivery deadline.

If sender-to-traveller invitations are included, add an explicit `tripInvitations` table rather than pretending an invitation is a traveller offer. An invitation must require the traveller to accept or convert it into an offer before the sender can pay.

## Backend Work

1. Extend Convex schema and generated types for the new trip and shipment fields.
2. Update create/edit mutations and shared validation.
3. Replace duplicated compatibility checks with shared, testable compatibility and scoring functions.
4. Add a query for ranked trip matches for one sender-owned parcel.
5. Add a query for ranked parcel matches for one traveller-owned trip.
6. Return match explanations and the remaining capacity on the relevant route segment.
7. Add a public marketplace profile query that returns only safe fields:
   - display name
   - verification indicator
   - member-since date
   - aggregate rating
   - review count
   - successful deliveries
   - paginated public review comments
   - relevant trip summary
8. Never return phone numbers, identity documents, receiver details, private instructions, or evidence to non-participants.
9. Keep offer creation and acceptance atomic and revalidate all compatibility rules at mutation time.
10. Notify the sender when an offer arrives and the traveller when an offer is accepted, declined, withdrawn, or superseded.

## Mobile Experience

Use the existing Passenger shared design tokens and components. Do not add literal colors, font families, spacing, radii, shadows, or control sizes inside screen components.

### Home entry points

Provide two explicit primary paths:

- `Send a parcel`
- `I'm travelling`

Both paths must remain available to the same account. Do not force a permanent sender/traveller account role.

### Traveller flow

1. Tap `I'm travelling` or `Publish a trip`.
2. Enter route, ordered stops, departure/arrival, capacity, per-parcel limit, accepted categories, and handling preferences.
3. Publish the trip.
4. Land on `Trips > My trips` with the new trip visible.
5. Open a trip and choose `Find parcels for this trip`.
6. Show ranked compatible parcels only.
7. Open a parcel to review the safe parcel details, sender marketplace profile summary, fixed backend-calculated fee, timing fit, and route fit.
8. Enter an expiry and optional note.
9. Send the carry offer through the real offer mutation.
10. Show the pending offer under the trip and allow withdrawal while it is still pending.

### Sender flow

1. Tap `Send a parcel`.
2. Enter parcel details, route, preferred pickup time, flexibility, deadline, receiver data, evidence, and safety declaration.
3. Submit the parcel for the existing review process.
4. Once approved/open, show ranked matching trips under the parcel.
5. Let the sender open a traveller profile and trip summary.
6. Clearly distinguish suggestions from offers. The sender cannot pay for a suggestion.
7. When traveller offers arrive, surface them in `Milestones > Needs action`.
8. Each offer must provide a `View traveller profile` action before Accept/Decline.
9. Accepting one offer transitions to the existing matched/payment flow.

### Trips screen

Keep the current Passenger card hierarchy and bottom-sheet interaction style, but change the information architecture to:

- `Available` — context-aware discovery. If the user selects one of their trips, show parcels compatible with it. If they want to send, show traveller trips matching their parcel/search window.
- `My trips` — published trips, remaining capacity, pending offers/invitations, and trip management.

Avoid a mixed card action such as `Send this way` when no parcel exists. First collect or select the parcel, then show ranked compatible trips.

### Traveller profile

The sender must be able to review, before accepting:

- Name and verification status.
- Member-since date.
- Rating and review count.
- Successful delivery count.
- Recent verified review comments.
- The exact trip being offered: route, stops, departure, arrival, remaining segment capacity, accepted categories, and rate.

Present this in a focused sheet consistent with the current `Needs action` sheets.

## Remove Prototype Behavior

Refactor or replace `apps/mobile/src/find-traveller.tsx`:

- Remove timeout-based fake payment success.
- Remove the fake wallet balance.
- Remove local-array chat that disappears when the component unmounts.
- Do not show `Payment Successful` unless the real provider webhook has updated Convex state.
- Do not expose `Book Delivery` as immediate booking if mutual consent has not happened.
- Make the flow create/select a real parcel and then show real ranked matches.
- Use the existing real payment action only after an offer is accepted.

## Design-System Requirements

- Use `@passenger/design-tokens` for every visual value.
- Reuse `JourneyRouteCard`, `JourneyCardStack`, `PresentationSheet`, `Button`, `Badge`, `Field`, `Notice`, and `Empty` where appropriate.
- Primary actions use the shared brand-green button variant.
- Destructive actions use the shared danger variant.
- Secondary actions use the shared outlined variant.
- No inline visual style objects in new marketplace screens.
- Cards should show only the information needed to compare a match. Put detailed profile and action content in focused sheets.
- Preserve accessible labels, roles, selected/disabled/busy state, keyboard behavior, and minimum touch targets.

## Required Tests

### Core tests

- Ordered direct and intermediate-stop route matching.
- Pickup window boundaries and time-proximity scoring.
- Arrival after deadline rejection.
- Category preference rejection.
- Per-parcel weight rejection.
- Overlapping-leg capacity rejection and non-overlapping capacity reuse.
- Minimum-rate compatibility.
- Deterministic ranking and tie-breaking.

### Backend tests

- Only the owner of a trip can offer from it.
- A sender cannot offer on or carry their own parcel.
- Unverified/suspended users cannot publish, offer, or accept.
- Stale client results fail safely when capacity or timing changes.
- One accepted offer reserves only the required route legs.
- Other pending offers are declined after acceptance.
- Payment cannot initialize before offer acceptance.
- Public profile queries do not leak private fields.
- Notifications are emitted for each offer lifecycle event.

### Mobile tests

- Traveller can publish a trip and reach matching parcels.
- Traveller can send and withdraw a real offer.
- Sender can create a parcel and see ranked trip suggestions after approval.
- Sender can open a traveller profile from an offer.
- Sender can accept one offer and reach real payment.
- Empty, loading, offline, expired, no-match, and server-rejection states are visible and recoverable.
- Back and close controls respond to one tap and do not stack duplicate sheets.

## Acceptance Criteria

The implementation is complete when this scenario works end to end without seeded shortcuts or simulated state:

1. Traveller A publishes a Jos-to-Abuja trip for a specific departure/arrival window and states what they can carry.
2. Sender B creates an approved Jos-to-Abuja parcel with a nearby preferred pickup time and flexibility.
3. Both sides see the other listing as a ranked compatible result with a clear time-fit explanation.
4. Traveller A opens the parcel and submits a carry offer tied to their trip.
5. Sender B receives the offer, opens Traveller A's safe public profile and trip details, and accepts the offer.
6. Capacity is reserved atomically and all competing offers are closed.
7. Sender B reaches the real payment flow; Traveller A sees payment pending until the provider confirms it.
8. The existing handover, in-transit, delivery-proof, dispute, review, and payout milestones continue unchanged.

Run the repository typecheck, core/backend tests, mobile web export, and relevant end-to-end tests before handing off the implementation.
