# Verification & Security Engine — Implementation Plan

## 1. Objective

Replace the current verification model with a staged trust model:

```text
NEW ACCOUNT
    ↓
No Tier / Unverified
    ↓ phone OTP succeeds
Tier 0
    ↓ Tier 1 application submitted
Pending Tier 1 Review
    ↓ admin approval
Tier 1
```

The core principle is:

> **Tier represents trust earned, not merely account status.**

A user should never receive a tier simply because an account exists.

The new system must distinguish:

- account existence;
- phone ownership;
- identity verification;
- address verification;
- Security Engine confidence;
- admin approval;
- transaction permissions.

The first real transactional trust level is **Tier 1**.

---

## 2. Trust states

### No Tier — new account

A newly created account is:

```ts
kycTier = null
identityVerificationStatus = "unverified"
phoneVerifiedAt = null
```

A no-tier user may:

- sign in;
- browse public content;
- manage basic account settings;
- begin phone verification.

A no-tier user may not:

- publish a live trip;
- publish a live shipment if sender verification is required;
- accept an offer;
- become matched into a package transaction;
- take custody of a package;
- receive payouts;
- perform any action that requires verified identity.

**Never silently map `null` to a tier.**

### Tier 0 — phone verified

Tier 0 is granted automatically after successful phone verification.

Tier 0 means only:

> **The platform has verified control of this phone number.**

It does not mean identity or address has been verified.

State:

```ts
kycTier = 0
phoneVerifiedAt = <server timestamp>
identityVerificationStatus = "unverified"
```

Tier 0 users may:

- complete their profile;
- begin Tier 1 verification;
- upload verification evidence;
- create drafts where appropriate;
- browse trips/packages.

Tier 0 users may not perform transactional trust actions.

### Tier 1 — identity + address + live presence verified

Tier 1 is the first level that permits real marketplace participation.

To apply for Tier 1, the user must provide:

- legal identity details;
- identity document evidence;
- structured current address;
- proof-of-address document;
- address exactly as written on the proof document;
- live location capture while physically present at the claimed address;
- a completed Security Engine assessment;
- manual compliance approval.

---

# 3. Separate status from tier

Do not overload one field for every concept.

Recommended canonical fields on the user record:

```ts
phoneVerifiedAt?: number

identityVerificationStatus:
  | "unverified"
  | "draft"
  | "pending"
  | "verified"
  | "rejected"

kycTier?: 0 | 1 | 2 | 3

identitySubmittedAt?: number
identityVerifiedAt?: number
addressVerifiedAt?: number
addressVerificationConfidence?: number
securityEngineScore?: number
securityEngineDecision?: "pass" | "review" | "high_risk"
lastVerificationReviewNote?: string
lastVerificationReviewedAt?: number
lastVerificationReviewedBy?: Id<"users">
```

Valid states:

```text
No Tier + unverified
Tier 0 + identity unverified
Tier 0 + pending
Tier 0 + rejected
Tier 1 + verified
```

Invalid states:

```text
Tier 1 + identity unverified
Tier 2 + identity pending
null tier treated as Tier 2
```

---

# 4. State machine

```text
SIGN UP
  |
  v
UNVERIFIED / NO TIER
  |
  | phone OTP verified
  v
TIER 0 / IDENTITY UNVERIFIED
  |
  | begin Tier 1 application
  v
TIER 0 / DRAFT
  |
  | identity + address + proof + live location complete
  v
TIER 0 / PENDING
  |
  +--------------------------+
  |                          |
  | admin approves           | admin rejects
  v                          v
TIER 1 / VERIFIED        TIER 0 / REJECTED
                             |
                             | user resubmits
                             v
                         TIER 0 / PENDING
```

A rejected Tier 1 applicant keeps Tier 0 if the phone remains verified.

Resubmission must:

- preserve prior audit history;
- create a new submission/version;
- never overwrite historical evidence references;
- clear only the active user-facing rejection note when resubmitted.

---

# 5. Tier 1 data requirements

## Identity

Collect:

- first name;
- last name;
- optional middle name;
- date of birth if already required by the product/compliance model;
- identity document type;
- identity document number where required;
- identity evidence images.

Accepted identity document types remain:

```text
national_id
passport
driving_licence
```

Do not enable BVN automatic promotion.
Do not add Tier 3 self-service.

## Structured current address

Do not use one uncontrolled string only.

```ts
{
  houseNumberOrName?: string,
  street: string,
  area?: string,
  city: string,
  lga?: string,
  state: string,
  postalCode?: string,
  country: "NG",
}
```

Also retain the raw user-entered address and a normalized display form.

## Proof of address

Require:

- proof-of-address type;
- proof-of-address evidence image/file;
- `proofAddressText`: the address as written on the proof document.

For MVP, the user types the address from the document and the admin visually confirms the image really contains that address.

Do not pretend OCR exists if it does not.

Design the schema so OCR can be added later.

Suggested source field:

```ts
proofAddressSource:
  | "user_entered"
  | "ocr_extracted"
  | "admin_corrected"
```

## Identity-document address

Treat an address shown on an identity document as optional supporting evidence only.

Do not make it a hard requirement because:

- people relocate;
- some documents do not show a useful current address;
- an otherwise valid identity document may contain an older address.

---

# 6. Security Engine

Create a dedicated module:

```text
packages/backend/convex/securityEngine.ts
```

The Security Engine must not automatically grant Tier 1 in the MVP.

Its role is to:

- normalize evidence;
- compare addresses;
- evaluate live-location proximity;
- identify anomalies;
- create an explainable score;
- provide a recommendation to compliance staff.

Manual admin approval remains mandatory for Tier 1.

---

# 7. Security Engine input

Recommended shape:

```ts
type SecurityEngineInput = {
  userId: Id<"users">

  claimedAddress: NormalizedAddress
  claimedAddressGeo?: {
    latitude: number
    longitude: number
    confidence?: number
    provider?: string
  }

  proofAddressText: string
  normalizedProofAddress?: NormalizedAddress

  identityDocumentAddressText?: string
  normalizedIdentityDocumentAddress?: NormalizedAddress

  liveLocation: {
    latitude: number
    longitude: number
    accuracyMeters: number
    capturedAt: number
    sampleCount: number
  }

  deviceSignals?: {
    mockedLocation?: boolean
    platform?: string
    appVersion?: string
  }

  priorVerificationAttempts?: number
}
```

---

# 8. Address normalization

Create:

```text
packages/backend/convex/address.ts
```

Responsibilities:

- trim whitespace;
- normalize case;
- normalize punctuation;
- normalize `No. 12` vs `12`;
- safely normalize common address abbreviations;
- preserve meaningful house/street information;
- normalize city/state names;
- create structured comparison components.

Do not compare raw address strings only.

Compare components:

- house number/name;
- street;
- area/neighbourhood;
- city;
- LGA if supplied;
- state;
- postal code if supplied.

Examples that should not fail because of formatting:

```text
No. 14 Yakubu Gowon Way, Jos
14 Yakubu Gowon Way, Anglo Jos
```

Do not rely on generic string similarity alone.

---

# 9. Geocoding abstraction

Create a provider abstraction instead of embedding one vendor everywhere.

Recommended structure:

```text
packages/backend/convex/geocoding/
  index.ts
  provider.ts
  types.ts
```

Interface:

```ts
interface GeocodingProvider {
  geocode(address: NormalizedAddress): Promise<{
    latitude: number
    longitude: number
    formattedAddress?: string
    confidence?: number
    providerResultId?: string
  }>
}
```

Requirements:

- geocode the claimed address once per submission unless it changes;
- cache the result on the verification submission;
- do not geocode on every admin page load;
- provider failure must route to manual review, not automatic rejection;
- other code should call the abstraction, not the vendor SDK directly.

---

# 10. Live address-verification session

Do not accept arbitrary coordinates at any time.

Create a short-lived server-generated session.

Recommended table:

```text
addressVerificationSessions
```

Suggested fields:

```ts
{
  userId: Id<"users">,
  submissionId: Id<"verificationSubmissions">,

  tokenHash: string,

  status:
    | "active"
    | "completed"
    | "expired"
    | "cancelled",

  createdAt: number,
  expiresAt: number,
  completedAt?: number,
  attempts: number,

  result?: {
    latitude: number,
    longitude: number,
    accuracyMeters: number,
    sampleCount: number,
    distanceFromClaimedMeters?: number,
  },

  deviceSignals?: {
    mockedLocation?: boolean,
    platform?: string,
    appVersion?: string,
  }
}
```

Initial session duration:

```text
5 minutes
```

Make it configurable.

Use server time for creation/expiry.

---

# 11. Location capture strategy

The client should request precise/high-accuracy location.

Do not accept one low-quality coordinate immediately.

Recommended client flow:

1. user starts address verification;
2. backend creates a short-lived session;
3. client requests high-accuracy location;
4. client gathers several readings over roughly 5–15 seconds;
5. poor readings are discarded;
6. client submits the sample set;
7. backend derives a stable coordinate and validates the session.

Example payload:

```ts
{
  sessionId,
  samples: [
    {
      latitude,
      longitude,
      accuracyMeters,
      clientCapturedAt,
      mocked?: boolean,
    }
  ]
}
```

Backend requirements:

- session must be active;
- session must belong to authenticated user;
- session must not be expired;
- validate coordinate ranges;
- require a minimum number of usable readings;
- reject stale readings;
- treat server receive time as authoritative;
- calculate a stable/median coordinate;
- store derived result.

Suggested initial minimum:

```text
3 usable samples
```

Make configurable.

---

# 12. GPS accuracy rules

Do not automatically reject legitimate users because GPS is imperfect.

Initial configurable guidance:

```text
accuracy <= 50m       strong
50m–100m              acceptable
100m–200m             weak / review signal
> 200m                insufficient quality
```

If quality is insufficient:

- ask user to retry;
- do not submit Tier 1 as complete;
- do not expose internal risk scoring.

---

# 13. Distance calculation

Use a tested Haversine implementation:

```ts
calculateDistanceMeters(
  pointA: { latitude: number; longitude: number },
  pointB: { latitude: number; longitude: number }
): number
```

Initial configurable bands:

```text
0–100m      strong match
101–250m    acceptable match
251–500m    manual review
>500m       high-risk mismatch
```

These are starting values, not permanent truth.

---

# 14. Security score

Return a structured 0–100 assessment.

Suggested MVP weighting:

```text
Live location vs claimed/geocoded address   50 points
Proof address vs claimed address            30 points
Identity document address support           10 points
Session/device integrity signals            10 points
```

Weights must be configurable constants, not magic numbers scattered through code.

Recommended result:

```ts
type SecurityAssessment = {
  version: "v1"
  score: number
  decision: "pass" | "review" | "high_risk"

  signals: {
    geoMatch: {
      score: number
      distanceMeters?: number
      accuracyMeters?: number
      status: "strong" | "acceptable" | "weak" | "mismatch" | "unavailable"
    }

    proofAddressMatch: {
      score: number
      status: "strong" | "partial" | "mismatch"
      matchedComponents: string[]
      mismatchedComponents: string[]
    }

    identityAddressMatch?: {
      score: number
      status: "strong" | "partial" | "mismatch" | "not_available"
    }

    deviceIntegrity: {
      score: number
      flags: string[]
    }
  }

  flags: Array<{
    code: string
    severity: "info" | "warning" | "high"
    message: string
  }>
}
```

Initial thresholds:

```text
80–100    pass recommendation
55–79     review
0–54      high risk / review
```

Important:

- `pass` does not mean auto-verified;
- low score does not mean auto-rejected;
- admin remains final decision-maker in MVP.

---

# 15. Address comparison weighting

Treat differences differently.

Recommended severity:

```text
State mismatch          severe
City mismatch           severe
Street mismatch         significant
House number mismatch   significant
Area mismatch           moderate
Postal code mismatch    moderate
Formatting difference   irrelevant
```

Example strong match:

```text
14 Yakubu Gowon Way
No. 14 Yakubu Gowon Way
```

Example severe mismatch:

```text
Jos, Plateau
Lekki, Lagos
```

---

# 16. Verification storage model

Do not store every verification attempt only on the user row.

Keep summary state on the user, but create versioned submissions.

## `verificationSubmissions`

Suggested fields:

```ts
{
  userId: Id<"users">,
  type: "tier_1",

  status:
    | "draft"
    | "pending"
    | "verified"
    | "rejected",

  version: number,

  legalName: {
    firstName: string,
    middleName?: string,
    lastName: string,
  },

  identityDocumentType:
    | "national_id"
    | "passport"
    | "driving_licence",

  identityDocumentNumber?: string,
  identityEvidenceIds: Id<"evidence">[],

  claimedAddress: NormalizedAddress,
  claimedAddressRaw: string,

  proofOfAddressType: string,
  proofAddressText: string,
  proofAddressSource: "user_entered" | "ocr_extracted" | "admin_corrected",
  proofAddressEvidenceIds: Id<"evidence">[],

  identityDocumentAddressText?: string,

  geocodedAddress?: {
    latitude: number,
    longitude: number,
    formattedAddress?: string,
    confidence?: number,
    provider?: string,
  },

  liveAddressResult?: {
    latitude: number,
    longitude: number,
    accuracyMeters: number,
    distanceMeters?: number,
    verifiedAt: number,
  },

  securityAssessment?: SecurityAssessment,

  submittedAt?: number,
  reviewedAt?: number,
  reviewedBy?: Id<"users">,
  reviewDecision?: "verified" | "rejected",
  reviewNote?: string,

  createdAt: number,
  updatedAt: number,
}
```

This gives:

- resubmission history;
- auditability;
- future re-scoring support;
- no destructive overwrite of old verification evidence.

---

# 17. Evidence model

Update evidence classification.

Recommended kinds:

```ts
type EvidenceKind =
  | "identity_front"
  | "identity_back"
  | "identity_other"
  | "proof_of_address"
  | "verification_live_photo"
```

Suggested evidence record:

```ts
{
  ownerUserId,
  kind,
  storageId,
  mimeType,
  sizeBytes,
  createdAt,
  verificationSubmissionId?,
}
```

Rules:

- evidence is private;
- users can only attach their own evidence;
- normal profile queries never expose verification storage IDs;
- admin/compliance access must be permission checked.

`verification_live_photo` may remain unused in MVP if no selfie/challenge is implemented yet.

---

# 18. Optional future live challenge

Do not block MVP on this.

The session design should allow a later upgrade with:

- live selfie;
- in-app camera only;
- server-generated challenge/nonce.

Do not require users to photograph their home exterior/interior unless a separate justified requirement exists.

---

# 19. Device/location risk signals

Treat these as signals, not proof.

Where the platform already exposes reliable information, optionally capture:

- mocked-location flag;
- emulator/simulator indicator in production;
- app version;
- platform;
- repeated attempts;
- impossible location jumps.

Do not auto-reject solely because of:

- IP geolocation;
- VPN detection;
- device type.

Do not introduce invasive fingerprinting for this feature.

---

# 20. Backend changes by file

Current backend root:

```text
packages/backend/convex/
```

The agent must inspect the real code before editing. The following are implementation targets based on the current flow described.

## `schema.ts`

Add/modify user fields:

```text
phoneVerifiedAt
identityVerificationStatus
kycTier
identitySubmittedAt
identityVerifiedAt
addressVerifiedAt
addressVerificationConfidence
securityEngineScore
securityEngineDecision
lastVerificationReviewNote
lastVerificationReviewedAt
lastVerificationReviewedBy
```

`kycTier` must allow no tier plus 0/1/2/3.

Do not default new users to a tier.

Add tables:

```text
verificationSubmissions
addressVerificationSessions
```

Update evidence schema if needed.

Add indexes for:

```text
verificationSubmissions.by_user
verificationSubmissions.by_user_status
verificationSubmissions.by_status
addressVerificationSessions.by_user
addressVerificationSessions.by_submission
addressVerificationSessions.by_status_expiry
```

Use current project conventions.

## `auth.ts`

On new user creation:

```ts
identityVerificationStatus = "unverified"
kycTier = undefined
phoneVerifiedAt = undefined
```

Preserve existing account creation behaviour.

Do not infer Tier 0 from a placeholder/non-placeholder phone string.

## `accounts.ts`

Preserve existing phone OTP protections:

- 6-digit OTP;
- 10-minute expiry;
- 5-attempt maximum;
- 63-second resend cooldown;
- duplicate verified-phone rejection;
- SMS-configured enforcement behaviour.

### Phone verification success

Call one canonical helper such as:

```ts
markPhoneVerified(...)
```

It should:

```ts
phoneVerifiedAt = now
kycTier = max(currentTier, 0)
```

Never downgrade Tier 1+.

### Tier 1 APIs

Refactor/extend the current identity submission flow.

Recommended APIs:

```ts
saveTier1IdentityDraft(...)
saveTier1AddressDraft(...)
startAddressVerification(...)
submitAddressVerification(...)
submitTier1Verification(...)
getMyVerificationStatus()
getMyActiveTier1Submission()
```

Fewer APIs are acceptable if they fit the architecture better, but do not mark the application `pending` until all required evidence exists.

### `submitTier1Verification`

Must require:

```text
phone verified
kycTier >= 0
identity evidence
claimed address
proof-of-address evidence
proofAddressText
completed live-address verification
Security Engine assessment
```

Then:

```ts
identityVerificationStatus = "pending"
identitySubmittedAt = now
```

Tier remains `0` until admin approval.

### Resubmission

If rejected:

- create a new submission version;
- keep Tier 0;
- preserve old submission/evidence;
- set pending only after the new application is complete.

## `sms.ts`

No major behaviour change unless it currently writes account verification state directly.

Centralize Tier 0 assignment through one canonical helper to avoid duplicated logic.

## `evidence.ts`

Add explicit support for `proof_of_address`.

Validate:

- owner;
- file count;
- file type/MIME;
- size;
- submission association;
- evidence category.

Prevent attaching another user's evidence to a submission.

## `security.ts`

Keep existing security code if it serves another purpose.

Prefer dedicated modules:

```text
securityEngine.ts
address.ts
geocoding/
verificationPolicy.ts
```

The Security Engine must remain independently testable.

## `admin.ts`

Prefer submission-based review:

```ts
reviewVerificationSubmission({
  submissionId,
  decision: "verified" | "rejected",
  note?,
})
```

Required checks:

- reviewer has `COMPLIANCE_MANAGE`;
- reviewer cannot review own submission;
- submission is `pending`;
- security assessment exists;
- concurrent/double review is prevented.

### Approval

On approval:

```ts
submission.status = "verified"
submission.reviewDecision = "verified"
submission.reviewedAt = now
submission.reviewedBy = reviewerId

user.identityVerificationStatus = "verified"
user.kycTier = 1 // unless already legitimately higher
user.identityVerifiedAt = now
user.addressVerifiedAt = submission.liveAddressResult.verifiedAt
user.addressVerificationConfidence = <derived value>
user.securityEngineScore = submission.securityAssessment.score
user.securityEngineDecision = submission.securityAssessment.decision
```

### Rejection

On rejection:

```ts
submission.status = "rejected"
user.identityVerificationStatus = "rejected"
user.kycTier = 0 // if phone remains verified
user.lastVerificationReviewNote = note
```

Do not delete evidence or history.

Notify the user using existing notification infrastructure.

Audit using domain events such as:

```text
verification.approved
verification.rejected
```

### `updateUserTier`

Harden existing admin tier updates:

- Tier 1+ normally requires identity status `verified`;
- privileged overrides require reason;
- every override is audit logged;
- no UI-only tier defaults.

## `lib.ts`

Critical change:

**Remove the current behaviour where verified-but-tierless users read as Tier 2.**

Recommended helpers:

```ts
getUserTier(user): number | null
requirePhoneVerified(ctx, userId)
requireTier(ctx, userId, minimumTier)
requireTransactionalVerification(ctx, userId)
```

`requireTransactionalVerification` should require:

```ts
identityVerificationStatus === "verified"
kycTier >= 1
```

Use a stable error code:

```text
VERIFICATION_REQUIRED
```

### `getTierLimits`

Handle explicitly:

```text
No Tier → no transactional permissions
Tier 0  → zero transactional capacity
Tier 1+ → configured limits
```

Never fall back to Tier 2.

## `kycTiers.ts`

Add Tier 0 explicitly if tiers are config-backed:

```text
Tier 0
maxCapacityKg = 0
maxShipmentValue = 0
canReceivePayout = false
```

Tier 1 limits must be conservative and admin-configurable.

Do not retain `100kg / ₦500k` as the accidental default for a newly verified Tier 1 user.

If business owners have not approved final values, use a clearly marked conservative placeholder, e.g.:

```text
Tier 1
maxCapacityKg = 10
maxShipmentValue = ₦100,000
```

Keep these in one configuration source.

## `journeys.ts`

Publishing a live trip requires Tier 1+.

Tier 0 may create a draft only if drafts exist.

Re-check backend state at publish time.

## `offers.ts`

Accepting an offer requires Tier 1+.

Do not rely on frontend gating only.

## Matching logic

Any backend function that creates/confirms a custody-bearing match must require the correct verification level for each relevant party.

If senders can currently enter real package transactions without Tier 1, explicitly decide whether sender Tier 1 is required and enforce it at the backend.

Given the trust architecture of this product, the safer default is:

> both sender and traveller must be Tier 1 before a real package handoff can occur.

## `finance.ts`

Payout eligibility requires:

```text
phone verified
identityVerificationStatus = verified
kycTier >= 1
```

Tier 0 cannot receive payouts.

A queued payout must not bypass a later compliance suspension without an explicit finance rule.

---

# 21. Security Engine execution flow

```text
User enters claimed address
        ↓
Normalize address
        ↓
Geocode claimed address
        ↓
Upload proof of address
        ↓
Enter proofAddressText
        ↓
Start live address-verification session
        ↓
Server issues short-lived session
        ↓
Client gathers precise location samples
        ↓
Backend validates and derives stable coordinate
        ↓
Compute distance from geocoded address
        ↓
Compare claimed vs proof address
        ↓
Evaluate optional ID-address support
        ↓
Security Engine creates assessment
        ↓
User submits Tier 1 application
        ↓
Status = pending, Tier remains 0
        ↓
Compliance review
        ↓
Approve → Tier 1
Reject  → Tier 0 + rejected
```

---

# 22. Admin review payload/UI

The admin review query should return a purpose-built object.

## User

- name;
- account ID;
- phone;
- phone verified state;
- current tier;
- account age;
- previous verification attempts.

## Identity

- document type;
- evidence;
- legal name;
- optional document address.

## Claimed address

- raw address;
- normalized address.

## Proof of address

- evidence;
- user-entered `proofAddressText`;
- normalized proof address;
- component-match result.

## Live location

- verification timestamp;
- GPS accuracy;
- distance from geocoded claimed address;
- map coordinates for authorised compliance/admin only.

## Security Engine

Example display:

```text
Overall Score: 87
Recommendation: PASS

Live location match       Strong       48/50
Proof address match       Strong       27/30
ID address support        Partial       5/10
Session/device integrity  Strong        7/10

Flags
- ID document address differs from current area
```

## Actions

```text
Approve Tier 1
Reject
```

A separate “request resubmission” action can be added later; rejection with a useful note is sufficient for MVP.

---

# 23. User-facing copy

Do not expose scores or fraud flags.

### No Tier

```text
Verify your phone to continue.
```

### Tier 0

```text
Phone verified.
Complete identity verification to send or carry packages.
```

### Draft

```text
Complete your verification.
```

### Pending

```text
Verification submitted.
We’re reviewing your information.
```

### Rejected

```text
We couldn’t verify the information provided.
Review the note below and submit again.
```

### Tier 1

```text
Identity verified.
```

Avoid claims such as:

```text
Safe user
Trusted person
Guaranteed identity
```

Verification describes what the platform checked, not future behaviour.

---

# 24. Audit logging

Recommended events:

```text
verification.phone_verified
verification.tier0_assigned
verification.tier1_draft_created
verification.identity_evidence_added
verification.proof_address_added
verification.address_session_started
verification.address_session_completed
verification.address_session_failed
verification.security_assessed
verification.submitted
verification.approved
verification.rejected
verification.resubmitted
verification.tier_changed
verification.tier_overridden
```

Audit payloads must avoid raw PII.

Do not put these in general audit text:

- full document numbers;
- full home addresses;
- exact GPS coordinates;
- evidence URLs.

Use IDs/references instead.

---

# 25. Privacy and sensitive-data rules

Exact home location is highly sensitive.

Rules:

- never return raw home coordinates in normal profile APIs;
- never expose coordinates to senders/travellers;
- never include exact coordinates in notifications;
- never include exact coordinates in analytics;
- restrict exact verification coordinates to compliance/admin roles;
- keep verification/security data separate from marketplace-profile data;
- do not automatically reuse verification coordinates as pickup/dropoff coordinates.

Keep only data that has an operational/legal purpose.

---

# 26. Retention

Add a configurable retention policy.

Prefer keeping long-lived decision metadata such as:

```text
addressVerifiedAt
distanceAtVerification
locationAccuracyAtVerification
securityEngineScore
securityEngineDecision
submissionId
```

Raw GPS samples should not be kept indefinitely by default.

If no product/legal retention period has been approved yet:

- make retention configurable;
- document the unresolved policy;
- do not silently make retention permanent.

---

# 27. Rate limits and abuse controls

Preserve current phone OTP limits.

Add verification-specific limits.

Suggested configurable initial control:

```text
Maximum 3 address-verification attempts per 24 hours before cooldown/review.
```

Repeated anomalies should create a review flag, not an automatic permanent ban.

---

# 28. Stable error codes

Use domain error codes instead of parsing strings.

Suggested:

```text
PHONE_VERIFICATION_REQUIRED
TIER1_REQUIRED
VERIFICATION_PENDING
VERIFICATION_REJECTED
ADDRESS_VERIFICATION_REQUIRED
ADDRESS_SESSION_EXPIRED
LOCATION_ACCURACY_TOO_LOW
ADDRESS_GEOCODING_UNAVAILABLE
EVIDENCE_REQUIRED
NOT_AUTHORISED
SELF_REVIEW_NOT_ALLOWED
```

Frontend maps these to user-friendly messages.

---

# 29. Migration plan

Do not deploy new tier semantics without migrating existing users.

## Inventory first

Count:

- users by current verification state;
- users with explicit tiers;
- verified users with no explicit tier;
- pending/rejected users;
- users with canonical phone verification;
- accounts that only have placeholder phone values.

## Migration rules

### Existing verified Tier 2/3

Preserve current tier.

### Existing verified Tier 1

Preserve Tier 1.

### Existing verified users with no explicit tier

Set explicitly to:

```text
Tier 1
```

Do **not** convert them to Tier 2 just because the old UI fallback behaved that way.

Audit:

```text
migration.verification_explicit_tier1
```

### Existing pending/rejected users with verified phone

Set:

```text
Tier 0
```

Preserve pending/rejected identity state.

### Existing unverified users with verified phone

Set Tier 0.

### Accounts without confirmed phone

Keep no tier.

Do not infer phone verification from a non-placeholder phone string.
Use the existing canonical verification indicator.

## Remove old fallback only after migration

After migration and validation:

> remove every code path that interprets missing tier as Tier 2.

---

# 30. Rollout order

## Phase A — schema and domain model

1. add fields;
2. add tables;
3. add indexes;
4. add types;
5. add tier/state helpers.

Do not change production gating yet.

## Phase B — migration

1. build dry-run report;
2. review counts;
3. apply migration;
4. verify no unexpected privilege changes.

## Phase C — Tier 0

1. phone verification assigns Tier 0;
2. no-tier users remain no tier;
3. remove tierless Tier 2 fallback after migration.

## Phase D — Tier 1 application

1. identity draft;
2. claimed address;
3. proof of address;
4. evidence;
5. submission versioning.

## Phase E — address presence

1. geocoding abstraction;
2. verification session;
3. sample submission;
4. Haversine distance;
5. Security Engine.

## Phase F — admin review

1. review query;
2. assessment breakdown;
3. approve/reject;
4. notifications;
5. audit logs.

## Phase G — enforcement

1. journeys;
2. offers;
3. matching;
4. payouts;
5. sender transactional actions where applicable.

## Phase H — frontend

1. no-tier state;
2. Tier 0 state;
3. Tier 1 onboarding;
4. address/location flow;
5. pending/rejected flow;
6. admin review UI.

## Phase I — QA and observability

1. unit tests;
2. integration tests;
3. permission tests;
4. metrics;
5. production rollout.

---

# 31. Test plan

## Unit tests — tier state

Test:

- new user has no tier;
- phone-verified user becomes Tier 0;
- phone verification never downgrades Tier 1+;
- Tier 0 is not transaction verified;
- Tier 1 is transaction verified;
- null tier never becomes Tier 2.

## Unit tests — distance

Test Haversine with:

- identical points;
- known short distance;
- negative coordinate values;
- invalid coordinate rejection.

## Unit tests — normalization

Test:

```text
No. 14 vs 14
case changes
extra whitespace
punctuation differences
city/state casing
safe abbreviations
```

## Unit tests — address comparison

Test:

- exact match;
- formatting-only difference;
- same street/different house number;
- same city/different street;
- different state;
- missing optional component.

## Unit tests — Security Engine

Test:

- pass band;
- review band;
- high-risk band;
- geocoder unavailable;
- ID address absent;
- poor GPS;
- large location mismatch;
- mocked-location signal;
- partial proof match.

## Unit tests — verification sessions

Test:

- cannot submit another user's session;
- expired session rejected;
- completed session cannot replay;
- insufficient sample count rejected;
- stale samples rejected.

---

# 32. Integration tests

## Happy path

```text
signup
→ no tier
→ verify phone
→ Tier 0
→ upload identity
→ enter address
→ upload proof
→ live location succeeds
→ Security Engine assessment
→ submit
→ pending
→ admin approves
→ Tier 1
→ publish trip allowed
→ payout eligibility allowed
```

## Rejection/resubmission

```text
Tier 0
→ submit Tier 1
→ admin rejects
→ Tier remains 0
→ review note visible
→ user resubmits
→ new submission version
→ pending
```

## Location mismatch

```text
claimed Jos
live location far outside allowed radius
→ high-risk recommendation
→ manual review
→ no automatic Tier 1
```

## Poor GPS

```text
accuracy insufficient
→ retry required
→ no false identity rejection
```

## Geocoder failure

```text
provider unavailable
→ manual-review path
→ no false automatic rejection
```

## Existing Tier 2/3 user

```text
phone verification rerun
→ higher tier preserved
```

---

# 33. Permission tests

Verify:

- user cannot read another user's evidence;
- user cannot read another user's verification coordinates;
- admin without `COMPLIANCE_MANAGE` cannot review;
- reviewer cannot review own submission;
- non-pending submission cannot be reviewed twice;
- tier overrides are permissioned and audit logged.

---

# 34. Frontend flow

The agent must inspect the existing frontend before implementation.

Do not build a desktop/web-style form wizard if the product is mobile-first.

Recommended flow:

```text
Verification
1. Phone
2. Identity
3. Address
4. Proof of address
5. Confirm location
6. Review
```

Keep each screen focused.

### Location screen copy

```text
Confirm your address

Be at the address you entered, then confirm your location.
```

Button:

```text
Confirm my location
```

During capture:

```text
Checking your location…
```

Success:

```text
Location confirmed
```

Poor accuracy:

```text
We couldn’t confirm your location accurately.
Move somewhere with a clearer GPS signal and try again.
```

Never show the user internal risk score/distance thresholds.

---

# 35. Analytics

Track product events without sensitive data.

Recommended:

```text
verification_started
phone_verification_completed
tier0_reached
tier1_identity_completed
tier1_address_completed
tier1_proof_uploaded
address_verification_started
address_verification_completed
address_verification_retry
tier1_submitted
tier1_approved
tier1_rejected
```

Never send to analytics:

- exact coordinates;
- full address;
- identity document number;
- evidence URL.

---

# 36. Operational metrics

Admin/compliance metrics should eventually include:

- Tier 1 submissions/day;
- approval rate;
- rejection rate;
- average review time;
- address verification retry rate;
- geocoder failure rate;
- GPS low-accuracy rate;
- Security Engine score distribution;
- high-risk mismatch rate;
- resubmission rate.

Use these to tune thresholds from real Nigerian usage.

---

# 37. Observability

Use safe structured logs.

Example:

```ts
{
  event: "address_verification_failed",
  userId,
  submissionId,
  reasonCode: "LOCATION_ACCURACY_TOO_LOW"
}
```

Do not put these in normal application logs:

- full home address;
- exact lat/lng;
- document image URL;
- NIN/passport/driving-licence number.

---

# 38. Security Engine versioning

Every assessment must record a version:

```ts
securityEngineVersion: "v1"
```

Do not silently reinterpret old decisions when weights/thresholds change.

---

# 39. Central verification policy

Create one configuration module, for example:

```text
verificationPolicy.ts
```

Keep values such as:

```ts
addressSessionDurationMs
minimumLocationSamples
maxAcceptedLocationAccuracyMeters
geoStrongDistanceMeters
geoAcceptableDistanceMeters
geoReviewDistanceMeters
securityPassThreshold
securityReviewThreshold
tier1DefaultLimits
maxAddressVerificationAttemptsPerDay
```

Do not scatter these values throughout the codebase.

---

# 40. Explicit non-goals for this implementation

Do not add unless already separately approved:

- automatic BVN verification;
- automatic NIN API verification;
- OCR-based KYC;
- facial recognition;
- automatic Tier 2 promotion;
- automatic Tier 3 promotion;
- background location tracking;
- home-photo requirements;
- AI fraud models;
- automatic Tier 1 approval;
- blockchain/audit-chain systems.

Design clean extension points, but do not build them now.

---

# 41. Definition of done

The change is complete only when all of the following are true.

## New users

- start unverified;
- have no tier.

## Phone

- existing OTP security behaviour remains;
- successful phone verification grants Tier 0;
- phone verification does not imply identity verification.

## Tier 0

- can begin Tier 1 verification;
- cannot publish live trips;
- cannot accept offers;
- cannot receive payouts;
- cannot perform transaction-trust actions.

## Tier 1 submission

Requires:

- identity;
- claimed address;
- proof of address;
- proof-address text;
- live address verification;
- Security Engine assessment.

## Live address verification

- uses a short-lived server session;
- accepts multiple live samples;
- validates GPS accuracy;
- uses Haversine distance;
- compares against geocoded claimed address;
- never relies only on IP location.

## Security Engine

- produces a versioned structured assessment;
- returns 0–100 score;
- returns signal breakdown and flags;
- does not auto-approve;
- does not auto-reject.

## Admin

- sees relevant evidence;
- sees address/location match;
- sees Security Engine breakdown;
- cannot review self;
- can approve or reject;
- actions are audited.

## Approval

- sets identity status to verified;
- grants Tier 1;
- stores summary metadata.

## Rejection

- keeps phone-verified user at Tier 0;
- stores review note;
- allows resubmission;
- preserves historical submission/evidence.

## Enforcement

- missing tier never falls back to Tier 2;
- Tier 1 required for live transactional actions;
- backend enforces rules independently of UI.

## Privacy

- exact home coordinates remain private;
- verification evidence remains private;
- sensitive data does not enter analytics/general logs.

## Migration

- existing legitimate higher tiers are preserved;
- tierless verified users become explicit Tier 1 rather than implicit Tier 2;
- phone-only verified users become Tier 0.

## Tests

- tier transition tests pass;
- Security Engine tests pass;
- permission tests pass;
- end-to-end verification flow passes.

---

# 42. Final engineering principle

Do not implement Tier 1 as:

```text
upload document
→ admin clicks verified
```

Implement it as:

```text
phone ownership
+
identity evidence
+
current declared address
+
proof of address
+
live presence at that address
+
Security Engine assessment
+
human review
=
Tier 1
```

The Security Engine should be built as a foundation that can later evaluate:

```text
user risk
+
package risk
+
journey risk
+
location anomalies
+
transaction history
+
dispute history
```

But version 1 must remain narrow, explainable, auditable, and reliable.

> **Build a trustworthy Tier 1 verification system without pretending the platform has automation or certainty that it does not actually have.**
