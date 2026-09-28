import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { financeTables } from "./financeSchema";

export const verification = v.union(
  v.literal("required"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

export const shipmentStatus = v.union(
  v.literal("pending_review"),
  v.literal("rejected"),
  v.literal("open"),
  v.literal("matched"),
  v.literal("funded"),
  v.literal("in_transit"),
  v.literal("delivered"),
  v.literal("disputed"),
  v.literal("cancelled"),
);

export const paymentStatus = v.union(
  v.literal("unpaid"),
  v.literal("pending"),
  v.literal("failed"),
  v.literal("held"),
  v.literal("refund_pending"),
  v.literal("refunded"),
  v.literal("payout_pending"),
  v.literal("payout_failed"),
  v.literal("released"),
  v.literal("reconciliation_required"),
);

export const codeKind = v.union(v.literal("handover"), v.literal("delivery"));
export const documentType = v.union(v.literal("national_id"), v.literal("passport"), v.literal("drivers_license"));
export const purpose = v.union(v.literal("identity"), v.literal("parcel"), v.literal("proof_of_address"));
export const offerStatus = v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("withdrawn"), v.literal("expired"));
export const resolution = v.union(v.literal("refund"), v.literal("release"), v.literal("resume"), v.literal("cancel"));
export const walletTransactionKind = v.union(v.literal("top_up"), v.literal("parcel_hold"), v.literal("parcel_refund"), v.literal("payout"));

// Staged trust model. Tier is trust earned, not account status. `identityVerificationStatus`
// is canonical and separate from `kycTier`. `verification` is retained as a legacy mirror.
export const identityVerificationStatus = v.union(
  v.literal("unverified"),
  v.literal("draft"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

export const kycTier = v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3));

export const identityBioData = v.object({
  firstName: v.optional(v.string()),
  middleName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  gender: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  nationality: v.optional(v.string()),
  maritalStatus: v.optional(v.string()),
  residentialAddress: v.optional(v.string()),
  stateOfResidence: v.optional(v.string()),
  lgaOfResidence: v.optional(v.string()),
  imageBase64: v.optional(v.string()),
});

export const identityFaceVerificationStatus = v.union(
  v.literal("required"),
  v.literal("captured"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

export const evidenceKind = v.union(
  v.literal("identity_front"),
  v.literal("identity_back"),
  v.literal("identity_other"),
  v.literal("proof_of_address"),
  v.literal("verification_live_photo"),
);

export const normalizedAddress = v.object({
  houseNumberOrName: v.optional(v.string()),
  street: v.string(),
  area: v.optional(v.string()),
  city: v.string(),
  lga: v.optional(v.string()),
  state: v.string(),
  postalCode: v.optional(v.string()),
  country: v.literal("NG"),
});

export const securityEngineDecision = v.union(v.literal("pass"), v.literal("review"), v.literal("high_risk"));

export const verificationSubmissionStatus = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

export const proofAddressSource = v.union(
  v.literal("user_entered"),
  v.literal("ocr_extracted"),
  v.literal("admin_corrected"),
);

export const addressVerificationSessionStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("expired"),
  v.literal("cancelled"),
);

export const securityAssessment = v.object({
  version: v.literal("v1"),
  score: v.number(),
  decision: securityEngineDecision,
  signals: v.object({
    geoMatch: v.object({
      score: v.number(),
      distanceMeters: v.optional(v.number()),
      accuracyMeters: v.optional(v.number()),
      status: v.union(
        v.literal("strong"),
        v.literal("acceptable"),
        v.literal("weak"),
        v.literal("mismatch"),
        v.literal("unavailable"),
      ),
    }),
    proofAddressMatch: v.object({
      score: v.number(),
      status: v.union(v.literal("strong"), v.literal("partial"), v.literal("mismatch")),
      matchedComponents: v.array(v.string()),
      mismatchedComponents: v.array(v.string()),
    }),
    identityAddressMatch: v.optional(
      v.object({
        score: v.number(),
        status: v.union(v.literal("strong"), v.literal("partial"), v.literal("mismatch"), v.literal("not_available")),
      }),
    ),
    deviceIntegrity: v.object({
      score: v.number(),
      flags: v.array(v.string()),
    }),
  }),
  flags: v.array(
    v.object({
      code: v.string(),
      severity: v.union(v.literal("info"), v.literal("warning"), v.literal("high")),
      message: v.string(),
    }),
  ),
});

export const promotionFields = {
  title: v.string(),
  body: v.string(),
  backgroundColor: v.string(),
  textColor: v.string(),
  imageUrl: v.string(),
  imageOnly: v.boolean(),
  destination: v.union(v.literal("send"), v.literal("travel"), v.literal("find"), v.literal("safety"), v.literal("activity"), v.literal("external")),
  externalUrl: v.string(),
  position: v.number(),
  published: v.boolean(),
};

export default defineSchema({
  promotions: defineTable(promotionFields).index("by_published_and_position", ["published", "position"]),
  ...authTables,

  users: defineTable({
    subject: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    profileImageStorageId: v.optional(v.id("_storage")),
    profileImageUploadRequestedAt: v.optional(v.number()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.string(),
    phoneVerificationTime: v.optional(v.number()),
    phoneVerifiedAt: v.optional(v.number()),
    identityVerificationStatus: v.optional(identityVerificationStatus),
    kycTier: v.optional(kycTier),
    identityNumberVerificationType: v.optional(v.union(v.literal("BVN"), v.literal("NIN"))),
    identityNumberVerifiedAt: v.optional(v.number()),
    identityNumberLast4: v.optional(v.string()),
    identityNumberVerifiedName: v.optional(v.string()),
    identityNumberProviderReference: v.optional(v.string()),
    identityBioData: v.optional(identityBioData),
    identityFaceVerificationStatus: v.optional(identityFaceVerificationStatus),
    identityFaceVerifiedAt: v.optional(v.number()),
    phoneVerificationCode: v.optional(v.string()),
    phoneVerificationAttempts: v.optional(v.number()),
    phoneVerificationPendingPhone: v.optional(v.string()),
    phoneVerificationExpiresAt: v.optional(v.number()),
    phoneVerificationRequestedAt: v.optional(v.number()),
    activationDestination: v.optional(v.union(v.literal("name"), v.literal("routes"))),
    deletionRequestedAt: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    verification,
    joinedAt: v.number(),
    suspended: v.optional(v.boolean()),
    suspensionReason: v.optional(v.string()),
    documentType: v.optional(documentType),
    identityEvidenceIds: v.optional(v.array(v.id("evidence"))),
    liveIdentityEvidenceId: v.optional(v.id("evidence")),
    identitySubmittedAt: v.optional(v.number()),
    identityReviewedAt: v.optional(v.number()),
    identityNote: v.optional(v.string()),
    identityVerifiedAt: v.optional(v.number()),
    addressVerifiedAt: v.optional(v.number()),
    addressVerificationConfidence: v.optional(v.number()),
    securityEngineScore: v.optional(v.number()),
    securityEngineDecision: v.optional(securityEngineDecision),
    lastVerificationReviewNote: v.optional(v.string()),
    lastVerificationReviewedAt: v.optional(v.number()),
    lastVerificationReviewedBy: v.optional(v.id("users")),
    walletBalanceNaira: v.optional(v.number()),
    walletVerifiedBalanceNaira: v.optional(v.number()),
    walletBlocked: v.optional(v.boolean()),
    walletMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
    tier: v.optional(v.union(v.literal("Tier 1"), v.literal("Tier 2"), v.literal("Tier 3"))),
    bvn: v.optional(v.string()),
    residenceState: v.optional(v.string()),
    residenceLga: v.optional(v.string()),
    residenceAddress: v.optional(v.string()),
    streetPhotoUrl: v.optional(v.string()),
    housePhotoUrl: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_subject", ["subject"]),

  identityVerificationSessions: defineTable({
    userId: v.id("users"),
    providerIdentityId: v.string(),
    type: v.union(v.literal("BVN"), v.literal("NIN")),
    status: v.union(v.literal("initiated"), v.literal("verified")),
    createdAt: v.number(),
    expiresAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_provider_identity", ["providerIdentityId"])
    .index("by_user", ["userId"]),

  evidence: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    purpose,
    kind: v.optional(evidenceKind),
    verificationSubmissionId: v.optional(v.id("verificationSubmissions")),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_storage", ["storageId"]),

  faces: defineTable({
    userId: v.id("users"),
    providerIdentityId: v.string(),
    modelVersion: v.string(),
    embedding: v.array(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .vectorIndex("by_face_embedding", { vectorField: "embedding", dimensions: 128, filterFields: ["modelVersion"] }),

  uploads: defineTable({
    ownerId: v.id("users"),
    purpose,
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  verificationSubmissions: defineTable({
    userId: v.id("users"),
    type: v.literal("tier_1"),
    status: verificationSubmissionStatus,
    version: v.number(),
    legalName: v.optional(
      v.object({
        firstName: v.string(),
        middleName: v.optional(v.string()),
        lastName: v.string(),
      }),
    ),
    identityDocumentType: v.optional(documentType),
    identityDocumentNumber: v.optional(v.string()),
    identityEvidenceIds: v.optional(v.array(v.id("evidence"))),
    liveIdentityEvidenceId: v.optional(v.id("evidence")),
    faceMatchStatus: v.optional(v.union(v.literal("matched"), v.literal("mismatch"))),
    faceMatchScore: v.optional(v.number()),
    faceMatchEvidenceId: v.optional(v.id("evidence")),
    faceMatchProviderIdentityId: v.optional(v.string()),
    faceMatchedAt: v.optional(v.number()),
    facePotentialDuplicate: v.optional(v.boolean()),
    claimedAddress: v.optional(normalizedAddress),
    claimedAddressRaw: v.optional(v.string()),
    proofOfAddressType: v.optional(v.string()),
    proofAddressText: v.optional(v.string()),
    proofAddressSource: v.optional(proofAddressSource),
    proofAddressEvidenceIds: v.optional(v.array(v.id("evidence"))),
    identityDocumentAddressText: v.optional(v.string()),
    geocodedAddress: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        formattedAddress: v.optional(v.string()),
        confidence: v.optional(v.number()),
        provider: v.optional(v.string()),
      }),
    ),
    liveAddressResult: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracyMeters: v.number(),
        distanceMeters: v.optional(v.number()),
        verifiedAt: v.number(),
      }),
    ),
    securityAssessment: v.optional(securityAssessment),
    submittedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    reviewDecision: v.optional(v.union(v.literal("verified"), v.literal("rejected"))),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"]),

  addressVerificationSessions: defineTable({
    userId: v.id("users"),
    submissionId: v.id("verificationSubmissions"),
    tokenHash: v.string(),
    status: addressVerificationSessionStatus,
    createdAt: v.number(),
    expiresAt: v.number(),
    completedAt: v.optional(v.number()),
    attempts: v.number(),
    result: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracyMeters: v.number(),
        sampleCount: v.number(),
        distanceFromClaimedMeters: v.optional(v.number()),
      }),
    ),
    deviceSignals: v.optional(
      v.object({
        mockedLocation: v.optional(v.boolean()),
        platform: v.optional(v.string()),
        appVersion: v.optional(v.string()),
      }),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_submission", ["submissionId"])
    .index("by_status_expiry", ["status", "expiresAt"]),

  serviceAreaSettings: defineTable({
    key: v.string(),
    baseLocation: v.string(),
    destinations: v.array(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  trips: defineTable({
    travellerId: v.id("users"),
    origin: v.string(),
    destination: v.string(),
    stops: v.optional(v.array(v.string())),
    departureAt: v.number(),
    arrivalAt: v.optional(v.number()),
    capacityKg: v.number(),
    reservedKg: v.number(),
    acceptedCategories: v.optional(v.array(v.string())),
    maxParcelWeightKg: v.optional(v.number()),
    handlingNotes: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("cancelled"), v.literal("completed"))),
    cancellationReason: v.optional(v.string()),
  })
    .index("by_traveller", ["travellerId"])
    .index("by_traveller_request", ["travellerId", "clientRequestId"])
    .index("by_departure", ["departureAt"]),

  shipments: defineTable({
    reference: v.string(),
    senderId: v.id("users"),
    travellerId: v.optional(v.id("users")),
    tripId: v.optional(v.id("trips")),
    origin: v.string(),
    destination: v.string(),
    description: v.string(),
    category: v.string(),
    weightKg: v.number(),
    valueNaira: v.number(),
    feeNaira: v.number(),
    receiverName: v.string(),
    receiverPhone: v.string(),
    status: shipmentStatus,
    paymentStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    approved: v.boolean(),
    reservationActive: v.boolean(),
    pickupInstructions: v.optional(v.string()),
    dropoffInstructions: v.optional(v.string()),
    readyAt: v.optional(v.number()),
    preferredPickupAt: v.optional(v.number()),
    pickupFlexBeforeMinutes: v.optional(v.number()),
    pickupFlexAfterMinutes: v.optional(v.number()),
    deliveryDeadline: v.optional(v.number()),
    evidenceIds: v.optional(v.array(v.id("evidence"))),
    safetyConsent: v.optional(v.boolean()),
    reviewNote: v.optional(v.string()),
    payByAt: v.optional(v.number()),
    handoverEvidenceIds: v.optional(v.array(v.id("evidence"))),
    deliveryEvidenceIds: v.optional(v.array(v.id("evidence"))),
    receiverPickupSmsStatus: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
    receiverDeliverySmsStatus: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
    handoverAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    latestLatitude: v.optional(v.number()),
    latestLongitude: v.optional(v.number()),
    latestLocationLabel: v.optional(v.string()),
    latestLocationAt: v.optional(v.number()),
    latestSafetyCheckInAt: v.optional(v.number()),
    locationCheckInCount: v.optional(v.number()),
    disputeUntil: v.optional(v.number()),
    exception: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    refundApproved: v.optional(v.boolean()),
    releaseApproved: v.optional(v.boolean()),
    pickupIndex: v.optional(v.number()),
    dropoffIndex: v.optional(v.number()),
    acceptedOfferId: v.optional(v.id("offers")),
  })
    .index("by_sender", ["senderId"])
    .index("by_traveller", ["travellerId"])
    .index("by_status", ["status"])
    .index("by_trip", ["tripId"]),

  offers: defineTable({
    shipmentId: v.id("shipments"),
    tripId: v.id("trips"),
    travellerId: v.id("users"),
    feeNaira: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    status: offerStatus,
    note: v.string(),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_traveller", ["travellerId"])
    .index("by_trip", ["tripId"])
    .index("by_status", ["status"]),

  audits: defineTable({
    actorId: v.optional(v.id("users")),
    actorName: v.string(),
    shipmentId: v.optional(v.id("shipments")),
    action: v.string(),
    detail: v.string(),
    createdAt: v.number(),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_created", ["createdAt"]),

  codes: defineTable({
    shipmentId: v.id("shipments"),
    kind: codeKind,
    hash: v.string(),
    expiresAt: v.number(),
    issuedAt: v.number(),
    consumedAt: v.optional(v.number()),
    attempts: v.number(),
    issueCount: v.number(),
    windowStart: v.number(),
    smsStatus: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
    smsId: v.optional(v.string()),
  }).index("by_shipment_kind", ["shipmentId", "kind"]),

  disputes: defineTable({
    shipmentId: v.id("shipments"),
    openedBy: v.id("users"),
    reason: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    previousStatus: shipmentStatus,
    createdAt: v.number(),
    resolution: v.optional(resolution),
    resolvedAt: v.optional(v.number()),
    externalReference: v.optional(v.string()),
    note: v.optional(v.string()),
    informationRequest: v.optional(v.string()),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_status", ["status"]),

  messages: defineTable({
    shipmentId: v.id("shipments"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_shipment", ["shipmentId"]),

  notifications: defineTable({
    userId: v.id("users"),
    shipmentId: v.optional(v.id("shipments")),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "readAt"]),

  reviews: defineTable({
    shipmentId: v.id("shipments"),
    authorId: v.id("users"),
    targetId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
    createdAt: v.number(),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_target", ["targetId"])
    .index("by_author", ["authorId"]),

  walletDeposits: defineTable({
    userId: v.id("users"),
    reference: v.string(),
    amountKobo: v.number(),
    url: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("paid"), v.literal("failed")),
    providerTransactionId: v.optional(v.string()),
    creditedAt: v.optional(v.number()),
    reversedAt: v.optional(v.number()),
    reversedKobo: v.optional(v.number()),
    providerMode: v.optional(v.union(v.literal("test"), v.literal("live"))),
    disputedAt: v.optional(v.number()),
    riskVersion: v.optional(v.number()),
    lastCheckedAt: v.optional(v.number()),
    nextCheckAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_reference", ["reference"]).index("by_user_and_status", ["userId", "status"]).index("by_nextCheckAt", ["nextCheckAt"]).index("by_providerTransactionId", ["providerTransactionId"]),
  walletReversals: defineTable({ reference: v.string(), providerId: v.string(), amountKobo: v.number(), createdAt: v.number() }).index("by_providerId", ["providerId"]),
  paymentRateLimits: defineTable({ key: v.string(), windowStart: v.number(), count: v.number() }).index("by_key", ["key"]),
  paymentAlerts: defineTable({ key: v.string(), detail: v.string(), createdAt: v.number(), updatedAt: v.number(), resolvedAt: v.optional(v.number()) }).index("by_key", ["key"]),
  walletTransactions: defineTable({
    userId: v.id("users"),
    kind: walletTransactionKind,
    amountNaira: v.number(),
    reference: v.string(),
    shipmentId: v.optional(v.id("shipments")),
    createdAt: v.number(),
    note: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_reference", ["reference"]),

  supportChats: defineTable({
    contextKind: v.optional(v.union(v.literal("delivery"), v.literal("trip"), v.literal("other"))),
    shipmentId: v.optional(v.id("shipments")),
    tripId: v.optional(v.id("trips")),
    deletedAt: v.optional(v.number()),
    userId: v.id("users"),
    subject: v.optional(v.string()),
    status: v.union(v.literal("unresolved"), v.literal("resolved"), v.literal("closed")),
    resolvedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    resolution: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    assignedByName: v.optional(v.string()),
    resolvedBy: v.optional(v.id("users")),
    resolvedByName: v.optional(v.string()),
    qaReviewedBy: v.optional(v.id("users")),
    qaReviewedByName: v.optional(v.string()),
    qaScore: v.optional(v.union(v.literal("approved"), v.literal("needs_work"))),
    qaNote: v.optional(v.string()),
    qaReviewedAt: v.optional(v.number()),
    activeViewedBy: v.optional(v.id("users")),
    activeViewedAt: v.optional(v.number()),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_last_message", ["lastMessageAt"]),

  supportMessages: defineTable({
    evidenceIds: v.optional(v.array(v.id("evidence"))),
    chatId: v.id("supportChats"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_chat", ["chatId"]),

  supportEvents: defineTable({
    chatId: v.id("supportChats"),
    actorId: v.optional(v.id("users")),
    actorName: v.string(),
    action: v.string(),
    detail: v.string(),
    createdAt: v.number(),
  })
    .index("by_chat", ["chatId"])
    .index("by_created", ["createdAt"]),

  faqs: defineTable({
    question: v.string(),
    answer: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  settings: defineTable({
    key: v.string(),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  escrowPolicies: defineTable({
    policyName: v.string(),
    type: v.string(),
    releaseTime: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  cancellationPolicies: defineTable({
    ruleName: v.string(),
    refundType: v.string(),
    refundPercent: v.number(),
    window: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  kycTiers: defineTable({
    tierName: v.string(),
    requirements: v.array(v.string()),
    maxShipmentValueNaira: v.number(),
    maxCapacityKg: v.optional(v.number()),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  adminRoles: defineTable({
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  teamMembers: defineTable({
    adminRoleId: v.id("adminRoles"),
    name: v.string(),
    email: v.string(),
    roleTitle: v.string(),
    mustChangePassword: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_adminRole", ["adminRoleId"])
    .index("by_email", ["email"]),

  permissions: defineTable({
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

  permissionGrants: defineTable({
    permissionId: v.id("permissions"),
    adminRoleId: v.id("adminRoles"),
    roleTitle: v.string(),
    granted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_adminRole", ["adminRoleId"])
    .index("by_permission", ["permissionId"])
    .index("by_roleTitle", ["roleTitle"]),

  securityEvents: defineTable({
    kind: v.union(v.literal("login"), v.literal("failed_login"), v.literal("admin_action")),
    actorId: v.optional(v.id("users")),
    actorName: v.string(),
    actorEmail: v.optional(v.string()),
    actorPhone: v.optional(v.string()),
    detail: v.string(),
    affectedSection: v.optional(v.string()),
    attempts: v.optional(v.number()),
    ipAddress: v.optional(v.string()),
    deviceInfo: v.optional(v.string()),
    location: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_kind", ["kind"]),

  feeConfig: defineTable({
    platformFeePercent: v.number(),
    baseFeeNaira: v.number(),
    distanceRateNairaPerKm: v.number(),
    minFeeNaira: v.optional(v.number()),
    categoryMultipliers: v.optional(v.any()),
    weightMultipliers: v.optional(v.any()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }),

  ...financeTables,
});
