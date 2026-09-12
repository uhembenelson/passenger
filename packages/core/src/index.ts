export type VerificationStatus = "required" | "pending" | "verified" | "rejected";
export type ShipmentStatus = "pending_review" | "rejected" | "open" | "matched" | "funded" | "in_transit" | "delivered" | "disputed" | "cancelled";
export type PaymentStatus = "unpaid" | "pending" | "failed" | "held" | "refund_pending" | "refunded" | "payout_pending" | "payout_failed" | "released" | "reconciliation_required";
export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";
export type DocumentType = "national_id" | "passport" | "drivers_license";
export type LocationCheckInState = "up_to_date" | "due_soon" | "overdue" | "complete";
export type WalletTransactionKind = "top_up" | "parcel_hold" | "parcel_refund" | "payout";

export interface WalletTransaction { id: string; userId: string; kind: WalletTransactionKind; amountNaira: number; reference: string; shipmentId?: string; createdAt: number; note: string; }
export interface Person { id: string; name: string; phone: string; email?: string; image?: string; tier?: string; phoneVerificationTime?: number; activationDestination?: "name" | "routes"; verification: VerificationStatus; role: "member" | "admin" | "compliance"; joinedAt: number; suspended?: boolean; suspensionReason?: string; mustChangePassword?: boolean; identityNote?: string; identitySubmittedAt?: number; documentType?: DocumentType; identityEvidenceIds?: string[]; rating?: number; reviewCount?: number; successfulDeliveries?: number; walletBalanceNaira?: number; bvn?: string; residenceState?: string; residenceLga?: string; residenceAddress?: string; streetPhotoUrl?: string; housePhotoUrl?: string; }
export interface Trip { id: string; travellerId: string; travellerName: string; origin: string; destination: string; stops?: string[]; departureAt: number; arrivalAt?: number; capacityKg: number; reservedKg?: number; legReservedKg?: number[]; acceptedCategories?: string[]; maxParcelWeightKg?: number; handlingNotes?: string; verified: boolean; status?: "active" | "cancelled" | "completed"; }
export interface FeeQuote { grossNaira: number; grossKobo: number; platformFeeKobo: number; travellerNetKobo: number; platformFeePercent: 10; }
export interface Shipment { id: string; reference: string; senderId: string; senderName: string; senderVerified?: boolean; travellerId?: string; travellerName?: string; origin: string; destination: string; description: string; category: string; weightKg: number; valueNaira: number; feeNaira: number; receiverName: string; receiverPhone: string; status: ShipmentStatus; paymentStatus: PaymentStatus; createdAt: number; updatedAt: number; tripId?: string; pickupInstructions?: string; dropoffInstructions?: string; readyAt?: number; preferredPickupAt?: number; pickupFlexBeforeMinutes?: number; pickupFlexAfterMinutes?: number; deliveryDeadline?: number; evidenceIds?: string[]; safetyConsent?: boolean; reviewNote?: string; payByAt?: number; handoverEvidenceIds?: string[]; deliveryEvidenceIds?: string[]; receiverPickupSmsStatus?: "pending" | "sent" | "failed"; receiverDeliverySmsStatus?: "pending" | "sent" | "failed"; handoverAt?: number; deliveredAt?: number; latestLatitude?: number; latestLongitude?: number; latestLocationLabel?: string; latestLocationAt?: number; latestSafetyCheckInAt?: number; locationCheckInCount?: number; locationCheckInTarget?: number; locationCheckInRemaining?: number; missedLocationCheckIns?: number; nextLocationCheckInAt?: number; locationCheckInState?: LocationCheckInState; disputeUntil?: number; exception?: string; cancellationReason?: string; refundApproved?: boolean; releaseApproved?: boolean; quote?: FeeQuote; }
export interface Offer { id: string; shipmentId: string; tripId: string; travellerId: string; travellerName: string; feeNaira: number; expiresAt: number; createdAt: number; status: OfferStatus; note: string; quote: FeeQuote; }
export interface AuditEntry { id: string; shipmentId?: string; actorName: string; action: string; detail: string; createdAt: number; }
export interface Dispute { id: string; shipmentId: string; reason: string; status: "open" | "resolved"; createdAt: number; previousStatus?: ShipmentStatus; resolution?: "refund" | "release" | "resume" | "cancel"; note?: string; informationRequest?: string; resolvedAt?: number; }
export interface Notification { id: string; title: string; body: string; shipmentId?: string; createdAt: number; readAt?: number; }
export interface Message { id: string; shipmentId: string; authorId: string; authorName: string; body: string; createdAt: number; }
export interface Review { id: string; shipmentId: string; authorId: string; targetId: string; rating: number; comment: string; createdAt: number; }
export interface ServiceAreaConfig { baseLocation: string; destinations: string[]; }
export interface MobileProductConfig {
  parcelTypes: { label: string; weightKg: number; category: string }[];
  wallet: { topUpPresetsNaira: number[]; withdrawalPresetsNaira: number[]; minTopUpNaira: number; maxTopUpNaira: number; defaultTopUpNaira: number };
  banks: { code: string; name: string }[];
  residence: { states: string[]; localGovernmentAreas: string[]; defaultState: string; defaultLocalGovernmentArea: string };
}
export type SupportChatStatus = "unresolved" | "resolved" | "closed";
export type SupportContextKind = "delivery" | "trip" | "other";
export interface SupportChat { contextKind?: SupportContextKind; shipmentId?: string; tripId?: string; deletedAt?: number; id: string; userId: string; userName?: string; userImage?: string; subject?: string; status: SupportChatStatus; lastMessage?: string; lastMessageAt: number; createdAt: number; resolvedAt?: number; closedAt?: number; resolution?: string; resolutionNote?: string; assignedTo?: string; assignedByName?: string; resolvedBy?: string; resolvedByName?: string; qaReviewedBy?: string; qaReviewedByName?: string; qaScore?: "approved" | "needs_work"; qaNote?: string; qaReviewedAt?: number; activeViewedBy?: string; activeViewedByName?: string; activeViewedAt?: number; }
export interface SupportMessage { id: string; chatId: string; authorId: string; body: string; createdAt: number; }
export interface SupportActivityEntry { id: string; chatId: string; actorId?: string; actorName: string; action: string; detail: string; createdAt: number; }
export interface AgentScoreboardEntry { agentName: string; openAssigned: number; resolved: number; reopened: number; avgFirstResponseMs: number | null; qaTotal: number; qaApproved: number; qaNeedsWork: number; }
export interface Faq { id: string; question: string; answer: string; createdAt: number; updatedAt: number; }
export interface EscrowPolicy { id: string; policyName: string; type: string; releaseTime: string; createdAt: number; updatedAt: number; }
export interface CancellationPolicy { id: string; ruleName: string; refundType: string; refundPercent: number; window: string; createdAt: number; updatedAt: number; }
export interface KycTier { id: string; tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string; createdAt: number; updatedAt: number; }
export interface AdminRole { id: string; name: string; memberCount: number; }
export interface TeamMember { id: string; adminRoleId: string; name: string; email: string; roleTitle: string; }
export interface Permission { id: string; name: string; }
export interface PermissionGrant { id: string; permissionId: string; adminRoleId: string; roleTitle: string; granted: boolean; }
export interface SuspiciousAccount { id: string; name: string; email?: string; phone?: string; attempts: number; }
export interface AdminLoginRecord { id: string; name: string; dateTime: string; ipAddress?: string; deviceInfo?: string; location?: string; }
export interface AdminActionRecord { id: string; name: string; dateTime: string; actionTaken: string; affectedSection?: string; ipAddress?: string; }
export interface SystemSetting { id: string; key: string; title: string; body: string; createdAt: number; updatedAt: number; }
export interface FeeConfig { platformFeePercent: number; baseFeeNaira: number; distanceRateNairaPerKm: number; minFeeNaira: number; categoryMultipliers?: Record<string, number>; weightMultipliers?: { minKg: number; maxKg: number; multiplier: number }[]; updatedAt: number; }
export interface SupportUserStats { shipmentsSent: number; shipmentsCarried: number; activeShipments: number; trips: number; activeTrips: number; openDisputes: number; openChats: number; walletBalanceNaira: number; }
export interface SupportUserDetails { user: Person; stats: SupportUserStats; shipments: Shipment[]; trips: Trip[]; walletTransactions: WalletTransaction[]; reviewsReceived: Review[]; reviewsGiven: Review[]; disputes: Dispute[]; events: AuditEntry[]; notifications: Notification[]; }
export interface DashboardSnapshot { viewer: Person | null; people: Person[]; trips: Trip[]; shipments: Shipment[]; events: AuditEntry[]; disputes: Dispute[]; offers?: Offer[]; notifications?: Notification[]; serviceArea?: ServiceAreaConfig; mobileConfig?: MobileProductConfig; walletTransactions?: WalletTransaction[]; reviews?: Review[]; supportChats?: SupportChat[]; supportMessages?: SupportMessage[]; faqs?: Faq[]; settings?: SystemSetting[]; feeConfig?: FeeConfig; escrowPolicies?: EscrowPolicy[]; cancellationPolicies?: CancellationPolicy[]; kycTiers?: KycTier[]; adminRoles?: AdminRole[]; teamMembers?: TeamMember[]; permissions?: Permission[]; permissionGrants?: PermissionGrant[]; suspiciousAccounts?: SuspiciousAccount[]; adminLogins?: AdminLoginRecord[]; adminActions?: AdminActionRecord[]; viewerPermissions?: PermissionKey[]; }
export interface CreateShipmentInput { origin: string; destination: string; description: string; category: string; weightKg: number; valueNaira: number; receiverName: string; receiverPhone: string; pickupInstructions: string; dropoffInstructions: string; readyAt: number; preferredPickupAt?: number; pickupFlexBeforeMinutes?: number; pickupFlexAfterMinutes?: number; deliveryDeadline: number; evidenceIds: string[]; safetyConsent: boolean; }
export interface CreateTripInput { origin: string; destination: string; stops: string[]; departureAt: number; arrivalAt: number; capacityKg: number; acceptedCategories?: string[]; maxParcelWeightKg?: number; handlingNotes?: string; }

export const CITIES = ["Jos", "Abuja", "Lagos", "Kaduna", "Kano", "Ibadan", "Enugu", "Port Harcourt"] as const;
export const CATEGORIES = ["Documents", "Clothing", "Electronics", "Books", "Household items", "Other"] as const;

export const PERMISSIONS = {
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  DELIVERIES_VIEW: "deliveries.view",
  DELIVERIES_MANAGE: "deliveries.manage",
  TRIPS_VIEW: "trips.view",
  TRIPS_MANAGE: "trips.manage",
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_MANAGE: "payments.manage",
  SUPPORT_VIEW: "support.view",
  SUPPORT_MANAGE: "support.manage",
  COMPLIANCE_VIEW: "compliance.view",
  COMPLIANCE_MANAGE: "compliance.manage",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  SECURITY_VIEW: "security.view",
  SECURITY_MANAGE: "security.manage",
  MONITORING_VIEW: "monitoring.view",
  NOTIFICATIONS_VIEW: "notifications.view",
} as const;
export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  jos: { lat: 9.8965, lon: 8.8583 },
  abuja: { lat: 9.0765, lon: 7.3986 },
  lagos: { lat: 6.5244, lon: 3.3792 },
  kaduna: { lat: 10.5105, lon: 7.4165 },
  kano: { lat: 12.0022, lon: 8.592 },
  ibadan: { lat: 7.3775, lon: 3.947 },
  enugu: { lat: 6.5244, lon: 7.5086 },
  "port harcourt": { lat: 4.8156, lon: 7.0498 },
};

const CATEGORY_FEE_MULTIPLIERS: Record<typeof CATEGORIES[number], number> = {
  Documents: 1,
  Clothing: 1.12,
  Electronics: 1.25,
  Books: 1.08,
  "Household items": 1.18,
  Other: 1.15,
};

const BASE_DELIVERY_FEE_NAIRA = 1400;
const DISTANCE_RATE_NAIRA_PER_KM = 17;
const UNKNOWN_DISTANCE_KM = 250;

export const STATUS_LABELS: Record<ShipmentStatus, string> = { pending_review: "Pending review", rejected: "Changes required", open: "Finding a traveller", matched: "Awaiting payment", funded: "Ready for handover", in_transit: "In transit", delivered: "Delivered", disputed: "Disputed", cancelled: "Cancelled" };
export const money = (amount: number) => `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
export const normalizeCity = (value: string) => value.trim().toLowerCase();

export function isPlaceholderPhone(value?: string | null): boolean {
  if (!value) return true;
  const digits = value.replace(/\D/g, "");
  return /^0+$/.test(digits) || /^2340+$/.test(digits) || digits.length === 0;
}

export function isValidPhone(value: string) {
  const text = value.trim();
  if (isPlaceholderPhone(text)) return false;
  const digits = text.replace(/\D/g, "");
  return /^\+?[\d\s()-]{10,20}$/.test(text) && digits.length >= 10 && digits.length <= 15;
}
export function normalizePhone(value: string) {
  if (!isValidPhone(value)) throw new Error("Enter a valid phone number.");
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `+234${digits}`;
  if (digits.length === 14 && digits.startsWith("2340") && /^[789]/.test(digits.slice(4))) return `+234${digits.slice(4)}`;
  if (digits.startsWith("234") && (digits.length === 13 || digits.length === 14)) return `+${digits.startsWith("2340") ? "234" + digits.slice(4) : digits}`;
  if (value.trim().startsWith("+")) return `+${digits}`;
  throw new Error("Use an international phone number starting with +.");
}
export function tripRoute(trip: { origin: string; destination: string; stops?: string[] }) { return [trip.origin, ...(trip.stops ?? []), trip.destination]; }
export function routeSegment(shipment: { origin: string; destination: string }, trip: { origin: string; destination: string; stops?: string[] }): { pickupIndex: number; dropoffIndex: number } | null { const cities = tripRoute(trip).map(normalizeCity); const pickupIndex = cities.indexOf(normalizeCity(shipment.origin)); const dropoffIndex = cities.indexOf(normalizeCity(shipment.destination)); return pickupIndex >= 0 && dropoffIndex > pickupIndex ? { pickupIndex, dropoffIndex } : null; }
export function routeMatches(a: { origin: string; destination: string }, b: { origin: string; destination: string; stops?: string[] }) { return routeSegment(a, b) !== null; }

function radians(value: number) { return value * Math.PI / 180; }

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const lat = radians(b.lat - a.lat);
  const lon = radians(b.lon - a.lon);
  const start = radians(a.lat);
  const end = radians(b.lat);
  const arc = Math.sin(lat / 2) ** 2 + Math.cos(start) * Math.cos(end) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function estimateRouteDistanceKm(origin: string, destination: string) {
  const from = CITY_COORDINATES[normalizeCity(origin)];
  const to = CITY_COORDINATES[normalizeCity(destination)];
  if (!from || !to) return UNKNOWN_DISTANCE_KM;
  return Math.max(120, Math.round(haversineKm(from, to)));
}

const DEFAULT_CATEGORY_MULTIPLIERS: Record<string, number> = { Documents: 1, Clothing: 1.12, Electronics: 1.25, Books: 1.08, "Household items": 1.18, Other: 1.15 };
const DEFAULT_WEIGHT_MULTIPLIERS = [{ minKg: 0, maxKg: 5, multiplier: 1 }, { minKg: 5, maxKg: 15, multiplier: 1.3 }, { minKg: 15, maxKg: 25, multiplier: 1.6 }];

export function calculateDeliveryFee(input: { origin: string; destination: string; category: string; weightKg?: number }, feeConfig?: FeeConfig) {
  validateRoute(input.origin, input.destination);
  if (!CATEGORIES.includes(input.category as typeof CATEGORIES[number])) throw new Error("Choose a valid package category.");
  const baseFee = feeConfig?.baseFeeNaira ?? BASE_DELIVERY_FEE_NAIRA;
  const distanceRate = feeConfig?.distanceRateNairaPerKm ?? DISTANCE_RATE_NAIRA_PER_KM;
  const minFee = feeConfig?.minFeeNaira ?? 2000;
  const categoryMults = feeConfig?.categoryMultipliers && Object.keys(feeConfig.categoryMultipliers).length ? feeConfig.categoryMultipliers : DEFAULT_CATEGORY_MULTIPLIERS;
  const weightMults = feeConfig?.weightMultipliers?.length ? feeConfig.weightMultipliers : DEFAULT_WEIGHT_MULTIPLIERS;
  const distanceKm = estimateRouteDistanceKm(input.origin, input.destination);
  const categoryMultiplier = categoryMults[input.category] ?? 1;
  const weight = input.weightKg ?? 1;
  const weightTier = weightMults.find((t) => weight >= t.minKg && (t.maxKg === Infinity || weight < t.maxKg));
  const weightMultiplier = weightTier?.multiplier ?? 1;
  const fee = (baseFee + distanceKm * distanceRate) * categoryMultiplier * weightMultiplier;
  return Math.max(minFee, Math.ceil(fee / 100) * 100);
}

export function segmentAvailableKg(trip: Trip, segment: { pickupIndex: number; dropoffIndex: number }) { const reserved = trip.legReservedKg ?? Array(tripRoute(trip).length - 1).fill(trip.reservedKg ?? 0); return trip.capacityKg - Math.max(0, ...reserved.slice(segment.pickupIndex, segment.dropoffIndex)); }
export type MatchableShipment = Pick<Shipment, "origin" | "destination" | "weightKg"> & Partial<Pick<Shipment, "category" | "readyAt" | "preferredPickupAt" | "pickupFlexBeforeMinutes" | "pickupFlexAfterMinutes" | "deliveryDeadline" | "paymentStatus">>;

export function tripAcceptsShipment(shipment: MatchableShipment, trip: Trip, now = Date.now()) {
  const segment = routeSegment(shipment, trip);
  const preferred = shipment.preferredPickupAt;
  const windowStart = preferred === undefined ? shipment.readyAt : preferred - (shipment.pickupFlexBeforeMinutes ?? 0) * 60000;
  const windowEnd = preferred === undefined ? undefined : preferred + (shipment.pickupFlexAfterMinutes ?? 0) * 60000;
  const categories = trip.acceptedCategories?.length ? trip.acceptedCategories : CATEGORIES;
  const maxParcelWeight = trip.maxParcelWeightKg ?? trip.capacityKg;
  return trip.verified && trip.status !== "cancelled" && trip.status !== "completed" && trip.departureAt > now
    && (!windowStart || trip.departureAt >= windowStart) && (!windowEnd || trip.departureAt <= windowEnd)
    && (!shipment.deliveryDeadline || !!trip.arrivalAt && trip.arrivalAt <= shipment.deliveryDeadline)
    && (!shipment.category || categories.includes(shipment.category as typeof CATEGORIES[number]))
    && (shipment.paymentStatus === undefined || ["held", "unpaid", "failed"].includes(shipment.paymentStatus))
    && shipment.weightKg <= maxParcelWeight && !!segment && segmentAvailableKg(trip, segment) >= shipment.weightKg;
}

export function matchScore(shipment: MatchableShipment, trip: Trip) {
  const preferred = shipment.preferredPickupAt ?? shipment.readyAt ?? trip.departureAt;
  const timeHours = Math.abs(trip.departureAt - preferred) / 3600000;
  const stopPenalty = trip.stops?.length ?? 0;
  return timeHours * 100 + stopPenalty * 10;
}

export function matchExplanation(shipment: MatchableShipment, trip: Trip) {
  const preferred = shipment.preferredPickupAt ?? shipment.readyAt;
  if (!preferred) return trip.stops?.length ? `Via ${trip.stops.join(", ")}` : "Direct route";
  const minutes = Math.round(Math.abs(trip.departureAt - preferred) / 60000);
  const timing = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} hr`;
  const direction = trip.departureAt >= preferred ? "after" : "before";
  return `${timing} ${direction} your preferred pickup · ${trip.stops?.length ? `${trip.stops.length} stop route` : "direct route"}`;
}

export interface TripMatch {
  trip: Trip;
  segment: { pickupIndex: number; dropoffIndex: number };
  availableKgOnSegment: number;
  score: number;
  explanation: string;
}

export interface ParcelMatch {
  shipment: Shipment;
  segment: { pickupIndex: number; dropoffIndex: number };
  availableKgOnSegment: number;
  score: number;
  explanation: string;
}

export function findMatchingTrips(shipment: MatchableShipment, trips: Trip[], now = Date.now()) { return trips.filter(t => tripAcceptsShipment(shipment, t, now)).sort((a, b) => matchScore(shipment, a) - matchScore(shipment, b) || a.departureAt - b.departureAt || a.id.localeCompare(b.id)); }
export function quoteFee(feeNaira: number): FeeQuote { if (!Number.isSafeInteger(feeNaira) || feeNaira <= 0 || feeNaira > 100000) throw new Error("Delivery fee must be whole naira between 1 and 100000."); const grossKobo = feeNaira * 100; const platformFeeKobo = Math.round(grossKobo / 10); return { grossNaira: feeNaira, grossKobo, platformFeeKobo, travellerNetKobo: grossKobo - platformFeeKobo, platformFeePercent: 10 }; }
export function validateRoute(origin: string, destination: string) { if (!origin.trim() || !destination.trim()) throw new Error("Origin and destination are required."); if (origin.length > 80 || destination.length > 80) throw new Error("City names must be under 80 characters."); if (normalizeCity(origin) === normalizeCity(destination)) throw new Error("Choose two different cities."); }
export function validateShipment(input: CreateShipmentInput, now = Date.now()) { validateRoute(input.origin, input.destination); for (const [label, value, max] of [["Weight", input.weightKg, 25], ["Declared value", input.valueNaira, 500000]] as const) { if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${label} must be greater than zero and at most ${max}.`); } if (!Number.isInteger(input.valueNaira)) throw new Error("Enter whole naira amounts."); if (input.description.trim().length < 5 || input.description.length > 1000) throw new Error("Describe the contents in 5–1000 characters."); if (!CATEGORIES.includes(input.category as typeof CATEGORIES[number])) throw new Error("Choose a valid package category."); if (!input.receiverName.trim() || input.receiverName.length > 120) throw new Error("Enter the receiver's name (up to 120 characters)."); normalizePhone(input.receiverPhone); for (const text of [input.pickupInstructions, input.dropoffInstructions]) if (!text || text.trim().length < 5 || text.length > 1000) throw new Error("Specify pickup and drop-off meeting instructions (5–1000 characters)."); if (!Number.isFinite(input.readyAt) || !Number.isFinite(input.deliveryDeadline) || input.deliveryDeadline <= Math.max(input.readyAt, now) || input.deliveryDeadline > now + 90 * 86400000) throw new Error("Set a ready time and a later future delivery deadline within 90 days."); if (input.preferredPickupAt !== undefined && (!Number.isFinite(input.preferredPickupAt) || input.preferredPickupAt < input.readyAt || input.preferredPickupAt >= input.deliveryDeadline)) throw new Error("Preferred pickup must be inside the parcel's pickup and delivery window."); for (const minutes of [input.pickupFlexBeforeMinutes, input.pickupFlexAfterMinutes]) if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 0 || minutes > 4320)) throw new Error("Pickup flexibility must be between 0 and 4320 minutes."); if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length < 1 || input.evidenceIds.length > 5) throw new Error("Add 1–5 parcel evidence uploads."); if (!input.safetyConsent) throw new Error("Confirm the safety declaration."); }
export function validateTrip(input: CreateTripInput, now = Date.now()) { validateRoute(input.origin, input.destination); const route = tripRoute(input); if (route.length > 10 || route.some(c => !c.trim() || c.length > 80) || new Set(route.map(normalizeCity)).size !== route.length) throw new Error("Use up to eight distinct ordered intermediate stops."); if (!Number.isFinite(input.departureAt) || input.departureAt <= now || input.departureAt > now + 90 * 86400000) throw new Error("Departure must be within the next 90 days."); if (!Number.isFinite(input.arrivalAt) || input.arrivalAt <= input.departureAt || input.arrivalAt > input.departureAt + 7 * 86400000) throw new Error("Arrival must follow departure within seven days."); if (!Number.isFinite(input.capacityKg) || input.capacityKg <= 0 || input.capacityKg > 100) throw new Error("Capacity must be between 0 and 100 kg."); const maxParcelWeight = input.maxParcelWeightKg ?? input.capacityKg; if (!Number.isFinite(maxParcelWeight) || maxParcelWeight <= 0 || maxParcelWeight > input.capacityKg) throw new Error("Maximum parcel weight must be within the trip's total capacity."); if (input.acceptedCategories && (!input.acceptedCategories.length || input.acceptedCategories.some(category => !CATEGORIES.includes(category as typeof CATEGORIES[number])))) throw new Error("Choose at least one valid parcel category."); if ((input.handlingNotes?.length ?? 0) > 500) throw new Error("Handling preferences must be 500 characters or fewer."); }
export const ALLOWED_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = { pending_review: ["open", "rejected", "cancelled"], rejected: ["pending_review", "cancelled"], open: ["pending_review", "matched", "cancelled"], matched: ["open", "funded", "cancelled", "disputed"], funded: ["in_transit", "cancelled", "disputed"], in_transit: ["delivered", "disputed"], delivered: ["disputed"], disputed: [], cancelled: [] };
export function assertTransition(from: ShipmentStatus, to: ShipmentStatus) { if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new Error(`Cannot move a delivery from ${from} to ${to}.`); }
export function shipmentActions(s: Shipment, viewer: Person | null, now = Date.now()) { const sender = viewer?.id === s.senderId; const traveller = viewer?.id === s.travellerId; const ready = viewer?.verification === "verified" && !viewer.suspended; const editablePayment = ["unpaid", "failed"].includes(s.paymentStatus); return { edit: !!sender && (["rejected", "pending_review"].includes(s.status) || s.status === "open" && editablePayment), cancel: !!sender && ["pending_review", "rejected", "open", "matched", "funded"].includes(s.status), pay: !!sender && !!ready && ["open", "matched"].includes(s.status) && ["unpaid", "pending", "failed"].includes(s.paymentStatus) && (!s.payByAt || s.payByAt > now), issueHandover: !!sender && s.status === "funded" && s.paymentStatus === "held", confirmHandover: !!traveller && s.status === "funded" && s.paymentStatus === "held", requestReceiverCode: !!(sender || traveller) && s.status === "in_transit" && s.paymentStatus === "held", confirmDelivery: !!traveller && s.status === "in_transit" && s.paymentStatus === "held", dispute: !!(sender || traveller) && ["matched", "funded", "in_transit", "delivered"].includes(s.status) && !["released", "refunded", "refund_pending", "payout_pending"].includes(s.paymentStatus) && (s.status !== "delivered" || !!s.disputeUntil && now < s.disputeUntil), review: !!(sender || traveller) && s.status === "delivered" && !!s.deliveredAt, message: !!(sender || traveller) } as const; }

export function sanitizeErrorMessage(message: string, fallback = "We couldn't finish that. Please try again."): string {
  if (!message || typeof message !== "string") return fallback;

  const convexErrorMatch = message.match(/Uncaught ConvexError:\s*([^\n]+)/i);
  if (convexErrorMatch?.[1]) {
    const extracted = convexErrorMatch[1].trim();
    if (extracted && !/^[a-z]+Error:\s*/i.test(extracted)) {
      return extracted;
    }
  }

  if (/network|fetch|timeout|timed out|socket|connection|offline|failed to connect/i.test(message)) {
    return "We couldn't connect. Your information is safe. Please check your connection and try again.";
  }

  if (/missing environment variable|internal server error|\b5\d\d\b|database error/i.test(message)) {
    return "Passenger is temporarily unavailable. Please try again shortly.";
  }

  const cleaned = message
    .replace(/\[CONVEX[^\]]*\]\s*/g, "")
    .replace(/\[Request ID:[^\]]*\]\s*/g, "")
    .replace(/Server Error:?\s*/gi, "")
    .split(/\n\s*at |\n\s*Called by client/i)[0]!
    .replace(/^Uncaught (Convex)?Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (!cleaned || /^[a-z]+Error:\s*/i.test(cleaned) || cleaned.includes("convex/") || cleaned.includes(".ts:") || cleaned.includes(".js:")) {
    return fallback;
  }

  return cleaned;
}

export function formatErrorMessage(error: unknown, fallback = "We couldn't finish that. Please try again."): string {
  if (!error) return fallback;

  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (typeof data === "string" && data.trim()) {
      return sanitizeErrorMessage(data, fallback);
    }
  }

  if (typeof error === "object" && error !== null && "errors" in error) {
    const errors = (error as { errors?: { longMessage?: string; message?: string }[] }).errors;
    if (errors?.[0]) {
      const msg = errors[0].longMessage || errors[0].message;
      if (msg) return sanitizeErrorMessage(msg, fallback);
    }
  }

  const rawMessage = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!rawMessage) return fallback;

  return sanitizeErrorMessage(rawMessage, fallback);
}
