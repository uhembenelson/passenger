import { v } from "convex/values";
import { isPlaceholderPhone, type Person } from "@passenger/core";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { audit, fail, findUserBySubject, person, personDto, requireActive, requireUser, safeNormalizePhone, smsConfigured, subject } from "./lib";
import { documentType } from "./schema";
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

function placeholderPhone(subjectValue: string) {
  const seed = subjectValue || "passenger";
  let digits = "";
  for (let index = 0; digits.length < 10; index += 1) {
    const code = seed.charCodeAt(index % seed.length) || 0;
    digits += String(code % 10);
  }
  return `+234${digits}`;
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
      phone: placeholderPhone(sub),
      email: identity.email ?? undefined,
      activationDestination: "name",
      verification: "required",
      joinedAt: Date.now(),
    });
    const user = (await ctx.db.get(id))!;
    await audit(ctx, user, "profile.created", "Profile created automatically from the signed-in account.");
    return person(user, true);
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
    if (smsConfigured() && !user.phoneVerificationTime) fail("Verify your phone number before submitting identity evidence.");

    const name = args.name.trim();
    if (!name || name.length > 120) fail("Name must be 1–120 characters.");

    const phone = safeNormalizePhone(args.phone);
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
  handler: async (ctx, args): Promise<{ phone: string; resendAt: number; expiresAt: number; skipped?: boolean }> => {
    const target = await ctx.runQuery(internal.accounts.phoneVerificationTarget, { sub: await subject(ctx) });
    if (!target) fail("Complete your profile first.");
    if (target.suspended) fail("Your account is suspended. Active delivery and support records remain accessible.");

    const phone = safeNormalizePhone(args.phone);
    if (isPlaceholderPhone(phone)) fail("Enter a valid mobile phone number.");
    if (!smsConfigured()) {
      await ctx.runMutation(internal.accounts.savePhoneWithoutOtp, { phone });
      return { phone, resendAt: 0, expiresAt: 0, skipped: true };
    }
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

    await ctx.runAction(internal.sms.sendPhoneVerificationCode, { receiverPhone: phone, code });
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
      phoneVerificationTime: verifiedAt,
      phoneVerificationCode: undefined,
      phoneVerificationPendingPhone: undefined,
      phoneVerificationRequestedAt: undefined,
      phoneVerificationExpiresAt: undefined,
    });
    await audit(ctx, user, "phone_verification.completed", "Phone number verified by one-time code.");
    return { verifiedAt };
  },
});

export const savePhoneWithoutOtp = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (smsConfigured()) fail("Phone verification is required.");
    const phone = safeNormalizePhone(args.phone);
    if (isPlaceholderPhone(phone)) fail("Enter a valid mobile phone number.");
    const owners = await ctx.db.query("users").withIndex("phone", q => q.eq("phone", phone)).collect();
    if (owners.some(owner => owner._id !== user._id && owner.phoneVerificationTime !== undefined)) fail("That phone number is already connected to another account.");
    await ctx.db.patch(user._id, {
      phone,
      phoneVerificationTime: phone === user.phone ? user.phoneVerificationTime : undefined,
      phoneVerificationCode: undefined,
      phoneVerificationPendingPhone: undefined,
      phoneVerificationExpiresAt: undefined,
      phoneVerificationRequestedAt: undefined,
      phoneVerificationAttempts: undefined,
    });
    await audit(ctx, user, "phone.updated", "Phone number saved without OTP because SMS is not configured.");
  },
});
