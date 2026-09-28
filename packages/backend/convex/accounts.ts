import { v } from "convex/values";
import { isPlaceholderPhone, type Person } from "@passenger/core";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { audit, fail, findUserBySubject, isIdentityNumberVerified, markPhoneVerified, person, personDto, requireActive, requireUser, safeNormalizePhone, smsConfigured, subject } from "./lib";
import { documentType, identityBioData } from "./schema";
import { validateEvidence } from "./evidence";

const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_RESEND_MS = 63 * 1000;

function fallbackProfileName(identity: { name?: string | null; email?: string | null; subject: string }) {
  const explicit = identity.name?.trim();
  if (explicit) return explicit.slice(0, 120);
  const emailName = identity.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (emailName) return emailName.slice(0, 120);
  return identity.subject.slice(0, 120);
}

export const ensureProfile = mutation({
  args: { name: v.string(), phone: v.string() },
  handler: async (ctx, args): Promise<Person> => {
    const sub = await subject(ctx);
    const existing = await findUserBySubject(ctx, sub);
    if (existing) return person(existing, true);

    const name = args.name.trim();
    if (!name || name.length > 120) fail("Name must be 1–120 characters.");

    const phone = safeNormalizePhone(args.phone);
    const id = await ctx.db.insert("users", {
      subject: sub,
      name,
      phone,
      verification: "required",
      identityVerificationStatus: "unverified",
      joinedAt: Date.now(),
    });
    const user = (await ctx.db.get(id))!;
    await audit(ctx, user, "profile.created", "Profile created; private identity evidence required.");
    return person(user, true);
  },
});

export const bootstrapProfile = mutation({
  args: {},
  handler: async (ctx): Promise<Person> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Sign in required.");

    const sub = identity.subject.split("|")[0]!;
    const existing = await findUserBySubject(ctx, sub);
    if (existing) return person(existing, true);

    const id = await ctx.db.insert("users", {
      subject: sub,
      name: fallbackProfileName(identity),
      phone: "",
      email: identity.email ?? undefined,
      activationDestination: "name",
      verification: "required",
      identityVerificationStatus: "unverified",
      joinedAt: Date.now(),
    });
    const user = (await ctx.db.get(id))!;
    await audit(ctx, user, "profile.created", "Profile created automatically from the signed-in account.");
    return person(user, true);
  },
});

// Repair accounts created before phone became an explicit verification step.
// An unverified account must never retain an unconfirmed phone value.
export const normalizeUnverifiedPhone = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.phoneVerificationTime === undefined && user.phone.trim() !== "") {
      await ctx.db.patch(user._id, { phone: "" });
      await audit(ctx, user, "phone.placeholder_removed", "Synthetic phone value removed; phone verification is required.");
      return { normalized: true };
    }
    return { normalized: false };
  },
});

export const completeActivation = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.activationDestination) {
      await ctx.db.patch(user._id, { activationDestination: undefined });
    }
    return { completed: true };
  },
});

export const saveActivationName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name || name.length > 120) fail("Enter your full name.");
    if (user.activationDestination === "name") {
      await ctx.db.patch(user._id, { name, activationDestination: "routes" });
      await audit(ctx, user, "profile.name_added", "Name added during account setup.");
    }
    return { completed: true };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUserBySubject(ctx, identity.subject);
    return user ? personDto(ctx, user, true) : null;
  },
});

export const updateContactDetails = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    const updates: Record<string, any> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 120) fail("Name must be 1–120 characters.");
      updates.name = name;
    }
    if (args.email !== undefined) {
      const email = args.email.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email address.");
      updates.email = email || undefined;
    }
    if (args.image !== undefined) {
      updates.image = args.image;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(user._id, updates);
      await audit(ctx, user, "profile.updated", "Profile contact details updated.");
    }
  },
});

export const generateProfileImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    requireActive(user);
    const now = Date.now();
    if (user.profileImageUploadRequestedAt && now - user.profileImageUploadRequestedAt < 10_000) {
      fail("Please wait a moment before choosing another profile photo.");
    }
    await ctx.db.patch(user._id, { profileImageUploadRequestedAt: now });
    return ctx.storage.generateUploadUrl();
  },
});

export const setProfileImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) fail("The uploaded profile photo could not be found.");
    if (metadata.size <= 0 || metadata.size > 5 * 1024 * 1024) fail("Profile photos must be smaller than 5 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(metadata.contentType ?? "")) {
      fail("Choose a JPEG, PNG, or WebP profile photo.");
    }
    const previous = user.profileImageStorageId;
    await ctx.db.patch(user._id, { profileImageStorageId: args.storageId, image: undefined });
    if (previous && previous !== args.storageId) await ctx.storage.delete(previous);
    await audit(ctx, user, "profile.photo_updated", "Profile photo updated.");
  },
});

export const requestAccountDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    requireActive(user);
    const sent = await ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", user._id)).collect();
    const carrying = await ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", user._id)).collect();
    const blocking = [...sent, ...carrying].some(shipment => !["delivered", "cancelled"].includes(shipment.status) || !["released", "refunded"].includes(shipment.paymentStatus));
    if (blocking) fail("Complete or resolve all active deliveries and held payments before requesting account deletion.");
    if ((user.walletBalanceNaira ?? 0) !== 0) fail("Your wallet balance must be zero before requesting account deletion.");
    if (!user.deletionRequestedAt) {
      await ctx.db.patch(user._id, { deletionRequestedAt: Date.now() });
      await audit(ctx, user, "account.deletion_requested", "Account deletion requested for operations review.");
    }
    return { requested: true };
  },
});

export const submitIdentity = mutation({
  args: { name: v.string(), phone: v.string(), documentType, evidenceIds: v.array(v.id("evidence")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) fail("Verify your identity with BVN or NIN before submitting identity evidence.");

    const name = args.name.trim();
    if (!name || name.length > 120) fail("Name must be 1–120 characters.");

    const phone = args.phone.trim() && !isPlaceholderPhone(args.phone) ? safeNormalizePhone(args.phone) : user.phone;
    await validateEvidence(ctx, args.evidenceIds, user._id, "identity");
    await ctx.db.patch(user._id, {
      name,
      phone,
      documentType: args.documentType,
      identityEvidenceIds: args.evidenceIds,
      verification: "pending",
      identitySubmittedAt: Date.now(),
      identityNote: undefined,
      identityReviewedAt: undefined,
    });
    await audit(ctx, user, "identity.submitted", "Private evidence submitted for manual identity review.");
  },
});

const identityNumberType = v.union(v.literal("BVN"), v.literal("NIN"));
const VERIFICATION_SESSION_TTL_MS = 10 * 60 * 1000;

type VerifiedIdentityBioData = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  nationality?: string;
  maritalStatus?: string;
  residentialAddress?: string;
  stateOfResidence?: string;
  lgaOfResidence?: string;
  imageBase64?: string;
};

function providerText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function providerImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= 900_000 ? normalized : undefined;
}

function verifiedIdentityBioData(value: unknown): VerifiedIdentityBioData {
  const identity = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    firstName: providerText(identity.firstName, 120),
    middleName: providerText(identity.middleName, 120),
    lastName: providerText(identity.lastName, 120),
    dateOfBirth: providerText(identity.dateOfBirth, 40),
    gender: providerText(identity.gender, 40),
    phoneNumber: providerText(identity.phoneNumber, 40),
    nationality: providerText(identity.nationality, 80),
    maritalStatus: providerText(identity.maritalStatus, 40),
    residentialAddress: providerText(identity.residentialAddress, 500),
    stateOfResidence: providerText(identity.stateOfResidence, 120),
    lgaOfResidence: providerText(identity.lgaOfResidence, 120),
    imageBase64: providerImage(identity.imageBase64),
  };
}

function verificationApiConfig() {
  const apiKey = process.env.V4_VERIFICATION_API_KEY?.trim();
  const apiSecret = process.env.V4_VERIFICATION_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return {
    baseUrl: (process.env.V4_VERIFICATION_API_URL?.trim() || "http://127.0.0.1:5000/api/v4/verifications").replace(/\/$/, ""),
    apiKey,
    apiSecret,
  };
}

async function verificationApiRequest(path: "/initiate" | "/verify", body: Record<string, string>) {
  const config = verificationApiConfig();
  if (!config) fail("Identity verification is temporarily unavailable because the provider credentials are not configured.");
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
        "X-API-Secret": config.apiSecret,
      },
      body: JSON.stringify(body),
    });
  } catch {
    fail("Passenger could not reach the identity verification provider. Please try again.");
  }
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    fail("The identity verification provider returned an unreadable response.");
  }
  if (!response.ok || payload?.success === false) {
    fail(typeof payload?.message === "string" && payload.message.trim() ? payload.message : "Identity verification failed. Please try again.");
  }
  return payload;
}

export const saveIdentityVerificationSession = internalMutation({
  args: { sub: v.string(), type: identityNumberType, providerIdentityId: v.string() },
  handler: async (ctx, args) => {
    const user = await findUserBySubject(ctx, args.sub);
    if (!user) fail("Complete your profile first.");
    requireActive(user);
    await ctx.db.insert("identityVerificationSessions", {
      userId: user._id,
      providerIdentityId: args.providerIdentityId,
      type: args.type,
      status: "initiated",
      createdAt: Date.now(),
      expiresAt: Date.now() + VERIFICATION_SESSION_TTL_MS,
    });
  },
});

export const identityVerificationSession = internalQuery({
  args: { sub: v.string(), type: identityNumberType, providerIdentityId: v.string() },
  handler: async (ctx, args) => {
    const user = await findUserBySubject(ctx, args.sub);
    if (!user) return null;
    const sessions = await ctx.db.query("identityVerificationSessions").withIndex("by_provider_identity", q => q.eq("providerIdentityId", args.providerIdentityId)).collect();
    const session = sessions.find(candidate => candidate.userId === user._id && candidate.type === args.type && candidate.status === "initiated");
    if (!session || session.expiresAt < Date.now()) return null;
    return { id: session._id };
  },
});

export const completeIdentityNumberVerification = internalMutation({
  args: { sub: v.string(), sessionId: v.id("identityVerificationSessions"), type: identityNumberType, providerIdentityId: v.string(), fullName: v.string(), bioData: identityBioData },
  handler: async (ctx, args) => {
    const user = await findUserBySubject(ctx, args.sub);
    if (!user) fail("Complete your profile first.");
    requireActive(user);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== user._id || session.providerIdentityId !== args.providerIdentityId || session.type !== args.type || session.status !== "initiated" || session.expiresAt < Date.now()) {
      fail("This verification session has expired. Start again.");
    }
    const verifiedAt = Date.now();
    const currentTier = user.kycTier ?? -1;
    const verifiedPhone = args.bioData.phoneNumber ? safeNormalizePhone(args.bioData.phoneNumber) : undefined;
    const oldFaceRecords = await ctx.db.query("faces").withIndex("by_user", q => q.eq("userId", user._id)).collect();
    for (const face of oldFaceRecords) await ctx.db.delete(face._id);
    await ctx.db.patch(user._id, {
      ...(verifiedPhone ? { phone: verifiedPhone } : {}),
      ...(args.fullName ? { name: args.fullName } : {}),
      identityNumberVerificationType: args.type,
      identityNumberVerifiedAt: verifiedAt,
      identityNumberLast4: undefined,
      identityNumberVerifiedName: args.fullName || user.name,
      identityNumberProviderReference: args.providerIdentityId,
      identityBioData: args.bioData,
      identityFaceVerificationStatus: args.bioData.imageBase64 ? "required" : undefined,
      identityFaceVerifiedAt: undefined,
      kycTier: Math.max(currentTier, 0) as 0 | 1 | 2 | 3,
    });
    await ctx.db.patch(session._id, { status: "verified", verifiedAt });
    await audit(ctx, user, "verification.identity_number_verified", `${args.type} verified by identity provider. Tier ${Math.max(currentTier, 0)} granted.`);
    return { type: args.type, verifiedAt, fullName: args.fullName || user.name };
  },
});

export const initiateIdentityNumberVerification = action({
  args: {
    type: identityNumberType,
    identityNumber: v.string(),
  },
  handler: async (ctx, args): Promise<{ identityId: string; type: "BVN" | "NIN"; message: string }> => {
    const sub = await subject(ctx);
    const identityNumber = args.identityNumber.replace(/\s/g, "");
    if (!/^\d{11}$/.test(identityNumber)) fail(`Enter a valid 11-digit ${args.type}.`);
    const config = verificationApiConfig();
    let providerIdentityId: string;
    let message: string;
    if (!config) {
      providerIdentityId = `sandbox-${args.type.toLowerCase()}-${Date.now()}`;
      message = "Sandbox mode: enter 123456 as the verification code.";
    } else {
      const payload = await verificationApiRequest("/initiate", { type: args.type, number: identityNumber });
      providerIdentityId = payload?.data?.identityId ?? payload?.identityId;
      const returnedType = payload?.data?.identityType ?? payload?.data?.type;
      if (typeof providerIdentityId !== "string" || !providerIdentityId.trim()) fail("The identity provider did not return a verification session.");
      if (returnedType && returnedType !== args.type) fail("The identity provider returned the wrong verification type.");
      message = typeof payload?.message === "string" ? payload.message : "Enter the OTP sent by the provider.";
    }
    await ctx.runMutation(internal.accounts.saveIdentityVerificationSession, { sub, type: args.type, providerIdentityId });
    return { identityId: providerIdentityId, type: args.type, message };
  },
});

export const verifyIdentityNumberOtp = action({
  args: { type: identityNumberType, identityId: v.string(), otp: v.string() },
  handler: async (ctx, args): Promise<{ type: "BVN" | "NIN"; verifiedAt: number; fullName: string }> => {
    const sub = await subject(ctx);
    const otp = args.otp.trim();
    if (!/^\d{6}$/.test(otp)) fail("Enter the 6-digit verification code.");
    const session: { id: Id<"identityVerificationSessions"> } | null = await ctx.runQuery(internal.accounts.identityVerificationSession, { sub, type: args.type, providerIdentityId: args.identityId });
    if (!session) fail("This verification session has expired. Start again.");
    const config = verificationApiConfig();
    let fullName: string;
    let bioData: VerifiedIdentityBioData;
    if (!config || args.identityId.startsWith("sandbox-")) {
      if (otp !== "123456") fail("In sandbox mode, enter 123456 as the verification code.");
      fullName = "Ada Ngozi Okafor";
      bioData = {
        firstName: "Ada",
        middleName: "Ngozi",
        lastName: "Okafor",
        dateOfBirth: "1992-05-14",
        gender: "Female",
        phoneNumber: "08012345678",
        nationality: "Nigerian",
        residentialAddress: "14 Victoria Island, Lagos",
        stateOfResidence: "Lagos",
        lgaOfResidence: "Eti-Osa",
        imageBase64: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%23E2E8F0'/><circle cx='60' cy='48' r='24' fill='%2394A3B8'/><path d='M24 104c0-19.882 16.118-36 36-36s36 16.118 36 36' fill='%2394A3B8'/></svg>",
      };
    } else {
      const payload = await verificationApiRequest("/verify", { type: args.type, identityId: args.identityId, otp });
      const data = payload?.data;
      if (payload?.success !== true || data?.verified !== true || data?.identityId !== args.identityId || data?.identityType !== args.type) {
        fail(typeof payload?.message === "string" ? payload.message : "The provider could not verify that code.");
      }
      const identity = data?.identity ?? {};
      fullName = [identity.firstName, identity.middleName, identity.lastName].filter((value: unknown) => typeof value === "string" && value.trim()).join(" ").trim();
      bioData = verifiedIdentityBioData(identity);
    }
    return await ctx.runMutation(internal.accounts.completeIdentityNumberVerification, {
      sub,
      sessionId: session.id,
      type: args.type,
      providerIdentityId: args.identityId,
      fullName,
      bioData,
    });
  },
});

export const upgradeToTier2 = mutation({
  args: { bvn: v.string() },
  handler: async (ctx, _args) => {
    await requireUser(ctx);
    fail("Automatic BVN upgrades are disabled. Submit identity evidence for operations review instead.");
  },
});

export const upgradeToTier3 = mutation({
  args: {
    state: v.string(),
    lga: v.string(),
    address: v.string(),
    streetPhotoUrl: v.optional(v.string()),
    housePhotoUrl: v.optional(v.string()),
  },
  handler: async (ctx, _args) => {
    await requireUser(ctx);
    fail("Automatic Tier 3 upgrades are disabled. Contact operations for a higher-value delivery review.");
  },
});

export const readiness = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return {
      smsConfigured: smsConfigured(),
      paymentsConfigured: !!process.env.PAYSTACK_SECRET_KEY,
      walletFundingMode: process.env.PAYSTACK_SECRET_KEY ? ("provider" as const) : ("manual" as const),
      platformFeePercent: 10 as const,
      disputeWindowHours: 24,
    };
  },
});

export const phoneVerificationTarget = internalQuery({
  args: { sub: v.string() },
  handler: async (ctx, args) => {
    const user = await findUserBySubject(ctx, args.sub);
    if (!user) return null;
    return {
      userId: user._id,
      suspended: user.suspended ?? false,
      phone: user.phone,
      phoneVerificationTime: user.phoneVerificationTime,
    };
  },
});

export const storePhoneVerificationCode = internalMutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
    code: v.string(),
    requestedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) fail("User not found.");
    requireActive(user);
    if (isPlaceholderPhone(args.phone)) fail("Enter a valid mobile phone number.");

    const matchingUsers = await ctx.db
      .query("users")
      .withIndex("phone", q => q.eq("phone", args.phone))
      .collect();
    const verifiedOwner = matchingUsers.find(
      candidate => candidate._id !== user._id && candidate.phoneVerificationTime !== undefined
    );
    if (verifiedOwner) fail("That phone number is already connected to another account.");

    if (user.phoneVerificationRequestedAt && Date.now() < user.phoneVerificationRequestedAt + PHONE_RESEND_MS) fail("Please wait before requesting another code.");
    await ctx.db.patch(user._id, {
      phoneVerificationAttempts: 0,
      phoneVerificationPendingPhone: args.phone,
      phoneVerificationCode: args.code,
      phoneVerificationRequestedAt: args.requestedAt,
      phoneVerificationExpiresAt: args.expiresAt,
    });
    await audit(ctx, user, "phone_verification.requested", "Phone verification code issued.");
  },
});

export const requestPhoneVerification = action({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<{ phone: string; resendAt: number; expiresAt: number }> => {
    const target = await ctx.runQuery(internal.accounts.phoneVerificationTarget, { sub: await subject(ctx) });
    if (!target) fail("Complete your profile first.");
    if (target.suspended) fail("Your account is suspended. Active delivery and support records remain accessible.");

    const phone = safeNormalizePhone(args.phone);
    if (isPlaceholderPhone(phone)) fail("Enter a valid mobile phone number.");

    const code: string = await ctx.runAction(internal.sms.generatePhoneCode, {});
    const requestedAt = Date.now();
    const expiresAt = requestedAt + PHONE_CODE_TTL_MS;
    const resendAt = requestedAt + PHONE_RESEND_MS;

    await ctx.runMutation(internal.accounts.storePhoneVerificationCode, {
      userId: target.userId,
      phone,
      code,
      requestedAt,
      expiresAt,
    });

    if (smsConfigured()) {
      await ctx.runAction(internal.sms.sendPhoneVerificationCode, { receiverPhone: phone, code });
    } else {
      console.log(`[phone-otp] verification code for ${phone}: ${code}`);
    }
    return { phone, resendAt, expiresAt };
  },
});

export const confirmPhoneVerification = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ verifiedAt: number }> => {
    const result = await ctx.runMutation(internal.accounts.consumePhoneVerification, args);
    if ("error" in result) fail(result.error!);
    return { verifiedAt: result.verifiedAt! };
  },
});

export const consumePhoneVerification = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);

    const code = args.code.trim();
    if (!/^\d{6}$/.test(code)) fail("Enter the 6-digit code.");
    if (!user.phoneVerificationCode || !user.phoneVerificationExpiresAt || user.phoneVerificationExpiresAt < Date.now()) {
      fail("This verification code has expired. Request a new code.");
    }
    if ((user.phoneVerificationAttempts ?? 0) >= 5) fail("Too many attempts. Request a new code.");
    if (code !== user.phoneVerificationCode) {
      await ctx.db.patch(user._id, { phoneVerificationAttempts: (user.phoneVerificationAttempts ?? 0) + 1 });
      return { error: "That code is not correct." };
    }

    const verifiedAt = Date.now();
    const pendingPhone = user.phoneVerificationPendingPhone;
    if (!pendingPhone || isPlaceholderPhone(pendingPhone)) fail("Request a new verification code.");

    const matchingUsers = await ctx.db
      .query("users")
      .withIndex("phone", q => q.eq("phone", pendingPhone))
      .collect();
    const verifiedOwner = matchingUsers.find(
      candidate => candidate._id !== user._id && candidate.phoneVerificationTime !== undefined
    );
    if (verifiedOwner) fail("That phone number is already connected to another account.");

    await ctx.db.patch(user._id, {
      phone: pendingPhone,
      phoneVerificationCode: undefined,
      phoneVerificationPendingPhone: undefined,
      phoneVerificationRequestedAt: undefined,
      phoneVerificationExpiresAt: undefined,
    });
    await markPhoneVerified(ctx, user, verifiedAt);
    await audit(ctx, user, "phone_verification.completed", "Phone number verified by one-time code.");
    return { verifiedAt };
  },
});

export const savePhoneWithoutOtp = internalMutation({
  args: { phone: v.string() },
  handler: async (_ctx, _args) => {
    fail("Phone verification is required.");
  },
});
