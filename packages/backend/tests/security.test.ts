import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { createHash, createHmac } from "node:crypto";
import { calculateDeliveryFee } from "@passenger/core";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const baseShipmentInput = { origin: "Jos", destination: "Abuja", description: "Two cotton shirts in sealed packaging", category: "Clothing", weightKg: 2, valueNaira: 20000, receiverName: "Receiver Private", receiverPhone: "+2348012345678", pickupInstructions: "Meet at the university main gate by the kiosk.", dropoffInstructions: "Call on arrival and meet at the estate front desk.", readyAt: Date.now() + 60_000, deliveryDeadline: Date.now() + 3 * 86_400_000, safetyConsent: true };
const backendCalculatedFeeNaira = calculateDeliveryFee({ origin: baseShipmentInput.origin, destination: baseShipmentInput.destination, category: baseShipmentInput.category, weightKg: baseShipmentInput.weightKg });
const backendCalculatedFeeKobo = backendCalculatedFeeNaira * 100;
const initialWalletBalanceNaira = 50000;
const walletBalanceAfterParcelHold = initialWalletBalanceNaira - backendCalculatedFeeNaira;
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}`, email: `${subject}@example.com` });
beforeEach(() => {
  vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_backend_only");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123456789");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-test-token");
  vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
  vi.unstubAllGlobals();
});
const shipmentInput = (evidenceIds: Id<"evidence">[]) => ({ ...baseShipmentInput, evidenceIds });
async function evidence(owner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, ownerId: Id<"users">, suffix: string) {
  return owner.run(async ctx => {
    const bytes = `parcel-${suffix}`;
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
    return ctx.db.insert("evidence", { ownerId, storageId, purpose: "parcel", filename: `parcel-${suffix}.jpg`, contentType: "image/jpeg", size: bytes.length, createdAt: Date.now() });
  });
}
async function fixture() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity(identity("admin")); const sender = t.withIdentity(identity("sender")); const traveller = t.withIdentity(identity("traveller")); const outsider = t.withIdentity(identity("outsider"));
  const a = await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000001" });
  const s = await sender.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000002" });
  const tr = await traveller.mutation(api.accounts.ensureProfile, { name: "Traveller", phone: "+2348000000003" });
  const o = await outsider.mutation(api.accounts.ensureProfile, { name: "Outsider", phone: "+2348000000004" });
  for (const user of [s, tr]) await admin.mutation(api.admin.reviewUser, { userId: user.id as Id<"users">, decision: "verified", note: "Identity checked out of band." });
  await t.run(ctx => ctx.db.patch(s.id as Id<"users">, { walletBalanceNaira: 50000 }));
  const evidenceId = await evidence(sender, s.id as Id<"users">, "initial");
  const shipmentId = await sender.mutation(api.marketplace.createShipment, shipmentInput([evidenceId]));
  await admin.mutation(api.admin.reviewShipment, { shipmentId, decision: "approve", note: "Package contents reviewed." });
  const tripId = await traveller.mutation(api.marketplace.createTrip, { origin: "Jos", destination: "Abuja", stops: [], departureAt: Date.now() + 86400000, arrivalAt: Date.now() + 2 * 86400000, capacityKg: 3 });
  return { t, admin, sender, traveller, outsider, shipmentId, tripId, senderId: s.id as Id<"users">, travellerId: tr.id as Id<"users">, outsiderId: o.id as Id<"users">, adminId: a.id as Id<"users"> };
}
const offerInput = () => ({ expiresAt: Date.now() + 60 * 60 * 1000, note: "Can collect before noon." });
async function acceptOffer(f: Awaited<ReturnType<typeof fixture>>) { await f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() }); const offer = await f.t.run(ctx => ctx.db.query("offers").first()); await f.sender.mutation(api.offers.accept, { offerId: offer!._id }); }
async function prepareUnpaidMatched(f: Awaited<ReturnType<typeof fixture>>) { await acceptOffer(f); await f.t.run(ctx => ctx.db.patch(f.shipmentId, { status: "matched", paymentStatus: "unpaid", payByAt: Date.now() + 1800000 })); }
async function funded() { const f = await fixture(); await acceptOffer(f); return f; }
const digest = (id: Id<"shipments">, kind: "handover" | "delivery", code: string) => createHash("sha256").update(`${id}:${kind}:${code}`).digest("hex");
function requiredCode(code: string | undefined) { expect(code).toBeDefined(); return code!; }
function smsCodeFromBody(body: string) {
  const message = new URLSearchParams(body).get("Body") ?? "";
  const code = message.match(/\b(\d{8})\b/)?.[1];
  expect(code).toBeDefined();
  return code!;
}
async function prove(f: Awaited<ReturnType<typeof funded>>, kind: "handover" | "delivery") {
  if (kind === "handover") {
    const code = requiredCode((await f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind })).code);
    await f.traveller.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code });
    return code;
  }

  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 200 }));
  try {
    expect(await f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind })).toEqual({});
    const smsBody = String(fetch.mock.calls.at(-1)?.[1]?.body ?? "");
    const code = smsCodeFromBody(smsBody);
    await f.traveller.action(api.deliveries.confirmDelivery, { shipmentId: f.shipmentId, code });
    return code;
  } finally {
    fetch.mockRestore();
  }
}

describe("identity and least privilege", () => {
  it("returns empty onboarding dashboards and denies anonymous writes", async () => {
    const t = convexTest(schema, modules);
    expect((await t.query(api.marketplace.dashboard, {})).viewer).toBeNull();
    expect((await t.withIdentity(identity("fresh")).query(api.marketplace.dashboard, {})).shipments).toEqual([]);
    await expect(t.mutation(api.accounts.ensureProfile, { name: "Anon", phone: "+2348000000000" })).rejects.toThrow("Sign in");
    await expect(t.mutation(api.marketplace.createShipment, shipmentInput([]))).rejects.toThrow("Sign in");
  });
  it("never accepts client roles; verification requires a separate allowlisted admin", async () => {
    const f = await fixture();
    await expect(f.outsider.mutation(api.admin.reviewUser, { userId: f.outsiderId, decision: "verified", note: "Give me access" })).rejects.toThrow("Administrator");
    await expect(f.admin.mutation(api.admin.reviewUser, { userId: f.adminId, decision: "verified", note: "Self approval" })).rejects.toThrow("own identity");
    await expect(f.outsider.mutation(api.accounts.ensureProfile, { name: "Escalate", phone: "+2348000000004", role: "admin" } as any)).rejects.toThrow();
    await expect(f.outsider.mutation(api.marketplace.createShipment, shipmentInput([]))).rejects.toThrow("verification");
    vi.stubEnv("ADMIN_CLERK_SUBJECTS", "");
    await expect(f.admin.mutation(api.admin.reviewUser, { userId: f.outsiderId, decision: "verified", note: "Removed admin" })).rejects.toThrow("Administrator");
    expect((await f.admin.query(api.marketplace.dashboard, {})).viewer?.role).toBe("member");
  });
  it("rejects punctuation-only and oversized phone numbers before profile writes", async () => {
    const t = convexTest(schema, modules); const user = t.withIdentity(identity("new-phone-user"));
    for (const phone of ["((((((((((", "1234567890123456", "--------()", "          "]) {
      await expect(user.mutation(api.accounts.ensureProfile, { name: "New Member", phone })).rejects.toThrow("valid phone");
    }
    expect(await t.run(ctx => ctx.db.query("users").collect())).toEqual([]);
    const profile = await user.mutation(api.accounts.ensureProfile, { name: "New Member", phone: "+234 801 234 5678" });
    expect(profile.phone).toBe("+2348012345678");
  });
  it("onboarding is idempotent and cannot overwrite reviewed identity", async () => {
    const f = await fixture(); const result = await f.sender.mutation(api.accounts.ensureProfile, { name: "Imposter", phone: "+2348999999999" });
    expect(result.name).toBe("Sender"); expect(result.verification).toBe("verified");
  });
  it("resumes new users at their saved activation step", async () => {
    const t = convexTest(schema, modules);
    const member = t.withIdentity(identity("new-route-user"));
    const first = await member.mutation(api.accounts.bootstrapProfile, {});
    const resumed = await member.mutation(api.accounts.bootstrapProfile, {});

    expect(resumed.id).toBe(first.id);
    expect((await member.query(api.marketplace.dashboard, {})).viewer?.activationDestination).toBe("name");

    await expect(member.mutation(api.accounts.saveActivationName, { name: "New Route User" })).resolves.toEqual({ completed: true });
    expect((await member.query(api.marketplace.dashboard, {})).viewer).toMatchObject({ name: "New Route User", activationDestination: "routes" });

    await expect(member.mutation(api.accounts.completeActivation, {})).resolves.toEqual({ completed: true });
    await expect(member.mutation(api.accounts.completeActivation, {})).resolves.toEqual({ completed: true });
    expect((await member.query(api.marketplace.dashboard, {})).viewer?.activationDestination).toBeUndefined();
  });
  it("changes a phone only after the one-time code is confirmed", async () => {
    const t = convexTest(schema, modules);
    const member = t.withIdentity(identity("phone-change"));
    const profile = await member.mutation(api.accounts.ensureProfile, { name: "Phone Member", phone: "+2348000000040" });
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    const request = await member.action(api.accounts.requestPhoneVerification, { phone: "+2348000000041" });
    expect(request.previewCode).toMatch(/^\d{6}$/);
    expect((await t.run(ctx => ctx.db.get(profile.id as Id<"users">)))?.phone).toBe("+2348000000040");
    await member.mutation(api.accounts.confirmPhoneVerification, { code: request.previewCode! });
    const updated = await t.run(ctx => ctx.db.get(profile.id as Id<"users">));
    expect(updated?.phone).toBe("+2348000000041");
    expect(updated?.phoneVerificationTime).toBeTypeOf("number");
    expect(updated?.phoneVerificationPendingPhone).toBeUndefined();
  });
  it("rejects placeholder phones and handles multiple accounts with duplicate unverified phones", async () => {
    const t = convexTest(schema, modules);
    const member1 = t.withIdentity(identity("user-1"));
    const member2 = t.withIdentity(identity("user-2"));
    const member3 = t.withIdentity(identity("user-3"));

    // Multiple users seeded or signed up with the default placeholder phone
    await member1.mutation(api.accounts.ensureProfile, { name: "User 1", phone: "+2348000000001" });
    await member2.mutation(api.accounts.ensureProfile, { name: "User 2", phone: "+2348000000002" });
    await member3.mutation(api.accounts.ensureProfile, { name: "User 3", phone: "+2348000000003" });

    // Directly set two unverified users to the same phone to simulate duplicate signups/placeholders
    await t.run(async ctx => {
      const users = await ctx.db.query("users").collect();
      for (const u of users) {
        await ctx.db.patch(u._id, { phone: "+2340000000000", phoneVerificationTime: undefined });
      }
    });

    // Attempting to verify placeholder numbers must be rejected
    await expect(member1.action(api.accounts.requestPhoneVerification, { phone: "+2340000000000" }))
      .rejects.toThrow("valid");

    // Attempting to verify a real phone number when multiple users share a phone must NOT throw unique() error
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    const req = await member1.action(api.accounts.requestPhoneVerification, { phone: "+2348011223344" });
    expect(req.previewCode).toMatch(/^\d{6}$/);
    await member1.mutation(api.accounts.confirmPhoneVerification, { code: req.previewCode! });

    // Now user 1 has verified +2348011223344. Another user trying to verify that same number must be blocked.
    await expect(member2.action(api.accounts.requestPhoneVerification, { phone: "+2348011223344" }))
      .rejects.toThrow("already connected");
  });
  it("fails closed for prototype tier and withdrawal endpoints", async () => {
    const f = await fixture();
    await expect(f.outsider.mutation(api.accounts.upgradeToTier2, { bvn: "12345678901" })).rejects.toThrow("identity evidence");
    await expect(f.sender.mutation(api.accounts.upgradeToTier3, { state: "Plateau", lga: "Jos North", address: "Example address" })).rejects.toThrow("disabled");
    await expect(f.sender.mutation(api.wallet.requestWithdrawal, { amountNaira: 1000 })).rejects.toThrow("not available");
  });
  it("records deletion requests only when no delivery or wallet work remains", async () => {
    const f = await fixture();
    await expect(f.sender.mutation(api.accounts.requestAccountDeletion, {})).rejects.toThrow("active deliveries");
    const t = convexTest(schema, modules); const member = t.withIdentity(identity("delete-ready"));
    const profile = await member.mutation(api.accounts.ensureProfile, { name: "Delete Ready", phone: "+2348000000042" });
    await expect(member.mutation(api.accounts.requestAccountDeletion, {})).resolves.toEqual({ requested: true });
    expect((await t.run(ctx => ctx.db.get(profile.id as Id<"users">)))?.deletionRequestedAt).toBeTypeOf("number");
  });
  it("redacts open market recipient and member contact information", async () => {
    const f = await fixture(); const outsider = await f.outsider.query(api.marketplace.dashboard, {});
    const market = await f.outsider.query(api.marketplace.availableShipmentsPage, { paginationOpts: { numItems: 20, cursor: null } });
    expect(market.page[0].receiverPhone).toBe(""); expect(market.page[0].receiverName).toBe("");
    expect(outsider.shipments).toEqual([]);
    expect(outsider.people.find(p => p.id === f.senderId)).toBeUndefined();
    expect(outsider.events).toEqual([]); expect(outsider.disputes).toEqual([]);
    expect((await f.sender.query(api.marketplace.dashboard, {})).shipments[0].receiverPhone).toBe(baseShipmentInput.receiverPhone);
    expect((await f.admin.query(api.marketplace.dashboard, {})).shipments[0].receiverPhone).toBe(baseShipmentInput.receiverPhone);
    await acceptOffer(f);
    expect((await f.outsider.query(api.marketplace.availableShipmentsPage, { paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
    expect((await f.traveller.query(api.marketplace.dashboard, {})).shipments[0].receiverPhone).toBe(baseShipmentInput.receiverPhone);
  });
});
describe("transactional matching and cancellation", () => {
  async function offerAccepted() {
    const f = await fixture();
    await acceptOffer(f);
    return f;
  }
  it("allows only the trip owner to propose and prohibits self-carry", async () => {
    const f = await fixture();
    await expect(f.sender.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() })).rejects.toThrow("trip owner");
    const ownTrip = await f.sender.mutation(api.marketplace.createTrip, { origin: "Jos", destination: "Abuja", stops: [], departureAt: Date.now() + 100000, arrivalAt: Date.now() + 200000, capacityKg: 10 });
    await expect(f.sender.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: ownTrip, ...offerInput() })).rejects.toThrow("own shipment");
  });
  it("rechecks sender verification and safety approval", async () => {
    const f = await fixture(); const pending = await f.sender.mutation(api.marketplace.createShipment, shipmentInput([await evidence(f.sender, f.senderId, "pending")]));
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: pending, tripId: f.tripId, ...offerInput() })).rejects.toThrow("approved open parcels");
    await f.admin.mutation(api.admin.reviewUser, { userId: f.senderId, decision: "rejected", note: "Verification withdrawn" });
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() })).rejects.toThrow("verification");
  });
  it("rejects expired, wrong-route, and incompatible offers", async () => {
    const f = await fixture();
    await f.t.run(async ctx => { await ctx.db.patch(f.tripId, { departureAt: Date.now() - 1 }); });
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() })).rejects.toThrow("active future trip");
    await f.t.run(async ctx => { await ctx.db.patch(f.tripId, { departureAt: Date.now() + 100000, destination: "Lagos" }); });
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() })).rejects.toThrow("ordered trip route");
    await f.t.run(async ctx => { await ctx.db.patch(f.tripId, { destination: "Abuja", maxParcelWeightKg: 1 }); });
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() })).rejects.toThrow("per-parcel weight limit");
  });
  it("does not overbook; cancellation restores capacity exactly once", async () => {
    const f = await offerAccepted();
    const second = await f.sender.mutation(api.marketplace.createShipment, shipmentInput([await evidence(f.sender, f.senderId, "second")])); await f.admin.mutation(api.admin.reviewShipment, { shipmentId: second, decision: "approve", note: "Package checked" });
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: second, tripId: f.tripId, ...offerInput() })).rejects.toThrow("capacity");
    await expect(f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: f.shipmentId, tripId: f.tripId, ...offerInput() })).rejects.toThrow("approved open parcels");
    await expect(f.outsider.mutation(api.marketplace.cancelShipment, { shipmentId: f.shipmentId })).rejects.toThrow("sender");
    await f.sender.mutation(api.marketplace.cancelShipment, { shipmentId: f.shipmentId });
    expect(await f.t.run(async ctx => ((await ctx.db.get(f.tripId)) as any)?.reservedKg)).toBe(0);
    await expect(f.sender.mutation(api.marketplace.cancelShipment, { shipmentId: f.shipmentId })).rejects.toThrow("cannot be cancelled");
    await f.traveller.mutation(api.marketplace.matchShipment, { shipmentId: second, tripId: f.tripId, ...offerInput() });
    const secondOffer = await f.t.run(async ctx => (await ctx.db.query("offers").withIndex("by_shipment", q => q.eq("shipmentId", second)).collect()).find(o => o.status === "pending"));
    await f.sender.mutation(api.offers.accept, { offerId: secondOffer!._id });
    expect(await f.t.run(async ctx => ((await ctx.db.get(f.tripId)) as any)?.reservedKg)).toBe(2);
  });
});
describe("one-time delivery proof", () => {
  it("requires payment, sender issuance, and traveller confirmation", async () => {
    const f = await fixture(); await acceptOffer(f);
    // With wallet-funded flow, acceptOffer transitions directly to funded.
    // Simulate unpaid state to verify stage guard still blocks code issuance.
    await f.t.run(ctx => ctx.db.patch(f.shipmentId, { status: "matched", paymentStatus: "unpaid" }));
    await expect(f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).rejects.toThrow("stage");
    // Restore funded state and verify sender-only issuance and traveller-only confirmation.
    await f.t.run(ctx => ctx.db.patch(f.shipmentId, { status: "funded", paymentStatus: "held" }));
    await expect(f.traveller.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).rejects.toThrow("sender");
    const code = requiredCode((await f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).code);
    expect(code).toMatch(/^\d{8}$/);
    await expect(f.sender.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code })).rejects.toThrow("traveller");
    await expect(f.outsider.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code })).rejects.toThrow("traveller");
    const stored = await f.t.run(ctx => ctx.db.query("codes").first());
    expect(stored?.hash).toBe(digest(f.shipmentId, "handover", code)); expect(stored).not.toHaveProperty("code");
    const audits = await f.t.run(ctx => ctx.db.query("audits").collect()); expect(audits.some(a => a.detail.includes(code))).toBe(false);
  });
  it("commits failed attempts despite the public action rejecting", async () => {
    const f = await funded(); const code = requiredCode((await f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).code);
    for (let i = 0; i < 5; i++) await expect(f.traveller.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code: "not-a-code" })).rejects.toThrow("Invalid or expired");
    expect(await f.t.run(async ctx => (await ctx.db.query("codes").first())?.attempts)).toBe(5);
    await expect(f.traveller.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code })).rejects.toThrow("locked");
  });
  it("expires proofs and throttles reissuance", async () => {
    const f = await funded(); const code = requiredCode((await f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).code);
    await expect(f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).rejects.toThrow("one minute");
    await f.t.run(async ctx => { const proof = (await ctx.db.query("codes").first())!; await ctx.db.patch(proof._id, { expiresAt: Date.now() - 1 }); });
    await expect(f.traveller.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code })).rejects.toThrow("expired");
    await f.t.run(async ctx => { const proof = (await ctx.db.query("codes").first())!; await ctx.db.patch(proof._id, { issuedAt: Date.now() - 60001, issueCount: 3 }); });
    await expect(f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).rejects.toThrow("three codes");
  });
  it("enforces the handover/delivery order and rejects replay", async () => {
    const f = await funded();
    await expect(f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "delivery" })).rejects.toThrow("stage");
    const handover = await prove(f, "handover");
    await expect(f.traveller.action(api.deliveries.confirmHandover, { shipmentId: f.shipmentId, code: handover })).rejects.toThrow("stage");
    const delivery = await prove(f, "delivery");
    await expect(f.traveller.action(api.deliveries.confirmDelivery, { shipmentId: f.shipmentId, code: delivery })).rejects.toThrow("stage");
    const s = await f.t.run(ctx => ctx.db.get(f.shipmentId)); expect(s?.status).toBe("delivered"); expect(s?.paymentStatus).toBe("held");
  });
  it("sends the receiver code by SMS without returning plaintext to the sender", async () => {
    const f = await funded();
    await prove(f, "handover");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ sid: "SM999", status: "queued" }), { status: 200 }));
    try {
      expect(await f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "delivery" })).toEqual({});
      const body = String(fetch.mock.calls.at(-1)?.[1]?.body ?? "");
      expect(smsCodeFromBody(body)).toMatch(/^\d{8}$/);
      const stored = await f.t.run(ctx => ctx.db.query("codes").withIndex("by_shipment_kind", q => q.eq("shipmentId", f.shipmentId).eq("kind", "delivery")).unique());
      expect(stored?.smsStatus).toBe("sent");
      expect(stored?.smsId).toBe("SM999");
    } finally {
      fetch.mockRestore();
    }
  });
  it("fails clearly when receiver SMS delivery is not configured", async () => {
    const f = await funded();
    await prove(f, "handover");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    await expect(f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "delivery" })).rejects.toThrow("SMS delivery is not configured");
    const stored = await f.t.run(ctx => ctx.db.query("codes").withIndex("by_shipment_kind", q => q.eq("shipmentId", f.shipmentId).eq("kind", "delivery")).unique());
    expect(stored?.smsStatus).toBe("failed");
  });
});
describe("payments, disputes, external-only reconciliation", () => {
  it("validates amount/currency/reference and settles one payment exactly once", async () => {
    const f = await fixture(); await prepareUnpaidMatched(f);
    await f.t.mutation(internal.paymentState.prepare, { subject: "sender", shipmentId: f.shipmentId, reference: "ref-1" });
    await expect(f.sender.mutation(api.marketplace.cancelShipment, { shipmentId: f.shipmentId })).rejects.toThrow("initialized");
    expect(await f.t.mutation(internal.paymentState.confirmPaid, { reference: "unknown", amountKobo: backendCalculatedFeeKobo, currency: "NGN", providerTransactionId: "1" })).toEqual({ accepted: false });
    for (const change of [{ amountKobo: 1 }, { currency: "USD" }]) await expect(f.t.mutation(internal.paymentState.confirmPaid, { reference: "ref-1", amountKobo: backendCalculatedFeeKobo, currency: "NGN", providerTransactionId: "1", ...change })).rejects.toThrow("mismatch");
    const payload = { reference: "ref-1", amountKobo: backendCalculatedFeeKobo, currency: "NGN", providerTransactionId: "1" };
    await f.t.mutation(internal.paymentState.confirmPaid, payload); await f.t.mutation(internal.paymentState.confirmPaid, payload);
    const audits = await f.t.run(ctx => ctx.db.query("audits").collect()); expect(audits.filter(a => a.action === "payment.provider_confirmed")).toHaveLength(1);
    await expect(f.t.mutation(internal.paymentState.confirmPaid, { ...payload, providerTransactionId: "other" })).rejects.toThrow("transaction");
  });
  it("denies payout before delivery and freezes proofs/payout while disputed", async () => {
    const f = await funded();
    await expect(f.admin.mutation(api.admin.recordPayout, { shipmentId: f.shipmentId, externalReference: "bank-1", note: "Paid externally" })).rejects.toThrow("delivered");
    await expect(f.outsider.mutation(api.deliveries.raiseDispute, { shipmentId: f.shipmentId, reason: "Unauthorized dispute" })).rejects.toThrow("participant");
    const disputeId = await f.sender.mutation(api.deliveries.raiseDispute, { shipmentId: f.shipmentId, reason: "The traveller failed to arrive." });
    await expect(f.sender.mutation(api.deliveries.raiseDispute, { shipmentId: f.shipmentId, reason: "Duplicate dispute attempt" })).rejects.toThrow("open dispute");
    await expect(f.sender.action(api.deliveries.issueCode, { shipmentId: f.shipmentId, kind: "handover" })).rejects.toThrow("dispute");
    await expect(f.admin.mutation(api.admin.recordPayout, { shipmentId: f.shipmentId, externalReference: "bank-1", note: "Paid externally" })).rejects.toThrow("dispute");
    await expect(f.outsider.mutation(api.admin.resolveDispute, { disputeId, resolution: "refund", note: "Refund issued", externalReference: "refund-1" })).rejects.toThrow("Administrator");
    await f.admin.mutation(api.admin.resolveDispute, { disputeId, resolution: "refund", note: "Refund reconciled against bank statement.", externalReference: "refund-1" });
    const s = await f.t.run(ctx => ctx.db.get(f.shipmentId)); expect(s?.paymentStatus).toBe("refunded");
    expect(await f.t.run(async ctx => ((await ctx.db.get(f.tripId)) as any)?.reservedKg)).toBe(0);
    await expect(f.admin.mutation(api.admin.resolveDispute, { disputeId, resolution: "release", note: "Try releasing twice", externalReference: "ref-2" })).rejects.toThrow("Open dispute");
  });
  it("records payout only after delivery and rejects duplicate reconciliation", async () => {
    const f = await funded(); await prove(f, "handover"); await prove(f, "delivery");
    await f.admin.mutation(api.admin.recordPayout, { shipmentId: f.shipmentId, externalReference: "bank-123", note: "External bank payment confirmed." });
    expect(await f.t.run(async ctx => (await ctx.db.get(f.shipmentId))?.paymentStatus)).toBe("released");
    await expect(f.admin.mutation(api.admin.recordPayout, { shipmentId: f.shipmentId, externalReference: "bank-123", note: "Attempt duplicate" })).rejects.toThrow("unreconciled");
    await expect(f.sender.mutation(api.deliveries.raiseDispute, { shipmentId: f.shipmentId, reason: "Attempt after reconciliation" })).rejects.toThrow("already reconciled");
  });
  it("keeps a pre-payment dispute frozen when a delayed charge arrives", async () => {
    const f = await fixture(); await prepareUnpaidMatched(f);
    await f.t.mutation(internal.paymentState.prepare, { subject: "sender", shipmentId: f.shipmentId, reference: "late-ref" });
    await f.sender.mutation(api.deliveries.raiseDispute, { shipmentId: f.shipmentId, reason: "Payment confirmation was uncertain." });
    await f.t.mutation(internal.paymentState.confirmPaid, { reference: "late-ref", amountKobo: backendCalculatedFeeKobo, currency: "NGN", providerTransactionId: "123" });
    const s = await f.t.run(ctx => ctx.db.get(f.shipmentId)); expect(s?.status).toBe("disputed"); expect(s?.paymentStatus).toBe("held");
  });
  it("rejects unsigned/forged webhooks and validates signed callbacks with provider", async () => {
    const f = await fixture(); await prepareUnpaidMatched(f);
    await f.t.mutation(internal.paymentState.prepare, { subject: "sender", shipmentId: f.shipmentId, reference: "webhook-ref" });
    const data = { reference: "webhook-ref", status: "success", amount: backendCalculatedFeeKobo, currency: "NGN", id: 1000 }; const body = JSON.stringify({ event: "charge.success", data });
    expect(await f.t.action(internal.payments.receiveWebhook, { body, signature: "" })).toEqual({ status: 401 });
    expect(await f.t.action(internal.payments.receiveWebhook, { body, signature: "0".repeat(128) })).toEqual({ status: 401 });
    const signature = createHmac("sha512", "sk_test_backend_only").update(body).digest("hex");
    // HMAC-validated webhook is trusted directly (no separate provider verify fetch).
    expect(await f.t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
    // Idempotent: duplicate webhook is accepted gracefully.
    expect(await f.t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
    expect(await f.t.run(async ctx => (await ctx.db.query("audits").collect()).filter(a => a.action === "payment.provider_confirmed").length)).toBe(1);
    expect(await f.t.run(async ctx => (await ctx.db.get(f.shipmentId))?.paymentStatus)).toBe("held");
    // A tampered body fails HMAC validation (signature doesn't match).
    const tampered = JSON.stringify({ event: "charge.success", data: { ...data, amount: 1 } });
    expect(await f.t.action(internal.payments.receiveWebhook, { body: tampered, signature })).toEqual({ status: 401 });
  });
  it("initializes hosted checkout with immutable server price, then reuses its URL", async () => {
    const f = await fixture(); await prepareUnpaidMatched(f);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const payload = JSON.parse(String(init?.body)); expect(payload.amount).toBe(backendCalculatedFeeKobo); expect(payload.currency).toBe("NGN"); expect(payload.email).toBe("sender@example.com"); expect(payload.reference).toMatch(/^passenger-[a-f0-9]{48}$/);
      return new Response(JSON.stringify({ status: true, data: { reference: payload.reference, authorization_url: "https://checkout.paystack.com/test-checkout" } }));
    });
    const checkout = await f.sender.action(api.payments.initialize, { shipmentId: f.shipmentId });
    expect(checkout.url).toBe("https://checkout.paystack.com/test-checkout");
    expect(await f.sender.action(api.payments.initialize, { shipmentId: f.shipmentId })).toEqual(checkout); expect(fetch).toHaveBeenCalledTimes(1);
    await expect(f.traveller.action(api.payments.initialize, { shipmentId: f.shipmentId })).rejects.toThrow("sender");
    expect(await f.t.run(async ctx => (await ctx.db.get(f.shipmentId))?.paymentStatus)).toBe("pending");
  });
  it("has no live-payment fallback without a provider key", async () => {
    const f = await fixture(); await prepareUnpaidMatched(f); vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    await expect(f.sender.action(api.payments.initialize, { shipmentId: f.shipmentId })).rejects.toThrow("not configured");
    expect(await f.t.run(ctx => ctx.db.query("payments").collect())).toEqual([]);
  });
});
describe("wallet funding and holds", () => {
  it("rejects shipment creation when wallet balance is insufficient", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_backend_only");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123456789");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-test-token");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
    const admin = t.withIdentity(identity("admin"));
    const sender = t.withIdentity(identity("sender"));
    await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000001" });
    const s = await sender.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000002" });
    await admin.mutation(api.admin.reviewUser, { userId: s.id as Id<"users">, decision: "verified", note: "Identity checked." });
    // Sender has 0 wallet balance (default)
    const evidenceId = await evidence(sender, s.id as Id<"users">, "wallet-test");
    await expect(sender.mutation(api.marketplace.createShipment, shipmentInput([evidenceId]))).rejects.toThrow("Insufficient wallet balance");
  });
  it("credits wallet via recordTopUp and deducts on shipment creation", async () => {
    const f = await fixture();
    // Sender starts with 50000. Create shipment deducts the backend-calculated fee.
    const senderUser = await f.t.run(ctx => ctx.db.get(f.senderId));
    expect(senderUser?.walletBalanceNaira).toBe(walletBalanceAfterParcelHold);
    // Record a top-up and verify balance increases.
    await f.t.mutation(internal.wallet.recordTopUp, { userId: f.senderId, amountNaira: 10000, reference: "test-topup-1" });
    const after = await f.t.run(ctx => ctx.db.get(f.senderId));
    expect(after?.walletBalanceNaira).toBe(walletBalanceAfterParcelHold + 10000);
    // Top-up is idempotent.
    await f.t.mutation(internal.wallet.recordTopUp, { userId: f.senderId, amountNaira: 10000, reference: "test-topup-1" });
    expect((await f.t.run(ctx => ctx.db.get(f.senderId)))?.walletBalanceNaira).toBe(walletBalanceAfterParcelHold + 10000);
    // Verify wallet transaction was recorded.
    const txns = await f.t.run(ctx => ctx.db.query("walletTransactions").withIndex("by_user", q => q.eq("userId", f.senderId)).collect());
    expect(txns.some(t => t.kind === "top_up" && t.amountNaira === 10000)).toBe(true);
    expect(txns.some(t => t.kind === "parcel_hold" && t.amountNaira === backendCalculatedFeeNaira)).toBe(true);
  });
  it("funds the wallet immediately when hosted payments are unavailable", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123456789");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-test-token");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15005550006");
    const member = t.withIdentity(identity("manual-topup"));
    const profile = await member.mutation(api.accounts.ensureProfile, { name: "Manual Topup", phone: "+2348000000099" });
    const funded = await member.action(api.wallet.initializeTopUp, { amountNaira: 7000 });
    expect(funded.mode).toBe("manual");
    if (funded.mode !== "manual") throw new Error("Expected manual wallet funding mode.");
    expect(funded.reference).toMatch(/^wallet-manual-/);
    expect(funded.balanceNaira).toBe(7000);
    expect((await t.run(ctx => ctx.db.get(profile.id as Id<"users">)))?.walletBalanceNaira).toBe(7000);
    await expect(member.action(api.wallet.verifyTopUp, { reference: funded.reference })).resolves.toEqual({ success: true, balanceNaira: 7000 });
  });
  it("refunds held fee when sender cancels a funded shipment", async () => {
    const f = await fixture();
    await acceptOffer(f);
    // After fixture + acceptOffer: 50000 - backend-calculated shipment fee.
    const before = await f.t.run(ctx => ctx.db.get(f.senderId));
    expect(before?.walletBalanceNaira).toBe(walletBalanceAfterParcelHold);
    // Cancel the funded shipment.
    await f.sender.mutation(api.marketplace.cancelShipment, { shipmentId: f.shipmentId });
    const after = await f.t.run(ctx => ctx.db.get(f.senderId));
    expect(after?.walletBalanceNaira).toBe(initialWalletBalanceNaira);
    // Shipment status should be cancelled with refunded payment.
    const s = await f.t.run(ctx => ctx.db.get(f.shipmentId));
    expect(s?.status).toBe("cancelled");
    expect(s?.paymentStatus).toBe("refunded");
    // Verify refund transaction was recorded.
    const txns = await f.t.run(ctx => ctx.db.query("walletTransactions").withIndex("by_user", q => q.eq("userId", f.senderId)).collect());
    expect(txns.some(t => t.kind === "parcel_refund" && t.amountNaira === backendCalculatedFeeNaira)).toBe(true);
  });
  it("supports service area routes between Jos and configured destinations (Abuja, Kaduna, Lagos)", async () => {
    const f = await fixture();
    const serviceArea = await f.t.query(api.serviceArea.get, {});
    expect(serviceArea.baseLocation).toBe("Jos");
    expect(serviceArea.destinations).toEqual(["Abuja", "Kaduna", "Lagos"]);

    // Creating a trip between Jos and Kaduna succeeds
    const kadunaTripId = await f.traveller.mutation(api.marketplace.createTrip, {
      origin: "Jos",
      destination: "Kaduna",
      stops: [],
      departureAt: Date.now() + 86400000,
      arrivalAt: Date.now() + 2 * 86400000,
      capacityKg: 5,
      });
    expect(kadunaTripId).toBeDefined();

    // Reverse route Kaduna to Jos also succeeds
    const returnTripId = await f.traveller.mutation(api.marketplace.createTrip, {
      origin: "Kaduna",
      destination: "Jos",
      stops: [],
      departureAt: Date.now() + 86400000,
      arrivalAt: Date.now() + 2 * 86400000,
      capacityKg: 5,
      });
    expect(returnTripId).toBeDefined();
  });
});
