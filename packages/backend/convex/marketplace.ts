import { v } from "convex/values";
import { calculateDeliveryFee, validateShipment, PERMISSIONS } from "@passenger/core";
import type { CreateShipmentInput, DashboardSnapshot, PermissionKey } from "@passenger/core";
import { tripArgs, createDefinition as createTripDefinition } from "./journeys";
import { query, mutation } from "./_generated/server";
import { findUserBySubject, isAdmin, isCompliance, isStaff, offerDto, participant, personDto, requireUser, requireVerified, shipmentDto, tripDto, audit, requireSender, shipment, releaseCapacity, transition, fail, effectiveChatStatus } from "./lib";
import { validateEvidence } from "./evidence";
import { proposeOffer } from "./offers";
import { assertSupportedRoute, getServiceArea } from "./serviceArea";
import { getFeeConfig, getTierLimits } from "./lib";
import { deductForShipment, refundForShipment } from "./wallet";

export const dashboard = query({
  args: {},
  handler: async (ctx): Promise<DashboardSnapshot> => {
    const identity = await ctx.auth.getUserIdentity();
    const serviceArea = await getServiceArea(ctx);
    const empty: DashboardSnapshot = { viewer: null, people: [], trips: [], shipments: [], events: [], disputes: [], offers: [], notifications: [], serviceArea, walletTransactions: [], reviews: [], supportChats: [], supportMessages: [], faqs: [], settings: [], feeConfig: undefined, escrowPolicies: [], cancellationPolicies: [], kycTiers: [], adminRoles: [], teamMembers: [], permissions: [], permissionGrants: [], suspiciousAccounts: [], adminLogins: [], adminActions: [], viewerPermissions: [] };
    if (!identity) return empty;

    const viewer = await findUserBySubject(ctx, identity.subject);
    if (!viewer) return empty;

    const admin = isStaff(viewer);
    const openShipments = await ctx.db.query("shipments").withIndex("by_status", q => q.eq("status", "open")).collect();
    const rawShipments = admin
      ? await ctx.db.query("shipments").collect()
      : [
          ...await ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", viewer._id)).collect(),
          ...await ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", viewer._id)).collect(),
          ...openShipments.filter(s => s.paymentStatus === "held"),
        ];
    const selected = [...new Map(rawShipments.map(s => [s._id, s])).values()].sort((a, b) => b.createdAt - a.createdAt);
    const own = selected.filter(s => participant(s, viewer));

    const rawTrips = admin
      ? await ctx.db.query("trips").collect()
      : [
          ...await ctx.db.query("trips").withIndex("by_departure", q => q.gt("departureAt", Date.now())).collect(),
          ...await ctx.db.query("trips").withIndex("by_traveller", q => q.eq("travellerId", viewer._id)).collect(),
        ];
    const trips = (await Promise.all([...new Map(rawTrips.map(t => [t._id, t])).values()].map(t => tripDto(ctx, t)))).filter(
      t => admin || t.travellerId === viewer._id || t.verified,
    );

    const userIds = new Set([
      viewer._id,
      ...selected.flatMap(s => (s.travellerId ? [s.senderId, s.travellerId] : [s.senderId])),
      ...trips.map(t => t.travellerId as typeof viewer._id),
    ]);
    const users = admin
      ? await ctx.db.query("users").collect()
      : (await Promise.all([...userIds].map(id => ctx.db.get(id)))).filter(u => u !== null);

    const events = admin
      ? await ctx.db.query("audits").withIndex("by_created").order("desc").take(200)
      : (await Promise.all(own.map(s => ctx.db.query("audits").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect())))
          .flat()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 200);
    const disputes = admin
      ? await ctx.db.query("disputes").collect()
      : (await Promise.all(own.map(s => ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect()))).flat();

    const rawOffers = admin
      ? await ctx.db.query("offers").collect()
      : [
          ...await ctx.db.query("offers").withIndex("by_traveller", q => q.eq("travellerId", viewer._id)).collect(),
          ...(await Promise.all(selected.map(s => ctx.db.query("offers").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect()))).flat(),
        ];
    const offers = [...new Map(rawOffers.map(o => [o._id, o])).values()].filter(
      o => admin || o.travellerId === viewer._id || selected.some(s => s._id === o.shipmentId && s.senderId === viewer._id),
    );

    const notifications = admin ? [] : await ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", viewer._id)).collect();
    const reviews = admin ? await ctx.db.query("reviews").collect() : [];
    const walletTransactions = admin
      ? (await ctx.db.query("walletTransactions").collect())
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 200)
      : (await ctx.db.query("walletTransactions").withIndex("by_user", q => q.eq("userId", viewer._id)).collect())
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 50);

    const rawSupportChats = admin
      ? await ctx.db.query("supportChats").withIndex("by_last_message").order("desc").collect()
      : [];
    const supportChats = await Promise.all(rawSupportChats.map(async (c) => {
      const user = await ctx.db.get(c.userId);
      const msgs = await ctx.db.query("supportMessages").withIndex("by_chat", q => q.eq("chatId", c._id)).order("desc").take(1);
      return { id: c._id, userId: c.userId, userName: user?.name ?? "Unknown", userImage: user?.image, subject: c.subject, status: effectiveChatStatus(c), lastMessage: msgs[0]?.body ?? "", lastMessageAt: c.lastMessageAt, createdAt: c.createdAt, resolvedAt: c.resolvedAt, closedAt: c.closedAt, resolution: c.resolution, resolutionNote: c.resolutionNote, assignedTo: c.assignedTo, assignedByName: c.assignedByName, resolvedBy: c.resolvedBy, resolvedByName: c.resolvedByName, qaReviewedBy: c.qaReviewedBy, qaReviewedByName: c.qaReviewedByName, qaScore: c.qaScore, qaNote: c.qaNote, qaReviewedAt: c.qaReviewedAt, activeViewedBy: c.activeViewedBy, activeViewedAt: c.activeViewedAt };
    }));
    const supportMessages = admin
      ? (await ctx.db.query("supportMessages").collect()).map(m => ({ id: m._id, chatId: m.chatId, authorId: m.authorId, body: m.body, createdAt: m.createdAt }))
      : [];
    const faqs = admin
      ? (await ctx.db.query("faqs").withIndex("by_created").order("desc").collect()).map(f => ({ id: f._id, question: f.question, answer: f.answer, createdAt: f.createdAt, updatedAt: f.updatedAt }))
      : [];
    const settings = admin
      ? (await ctx.db.query("settings").collect()).map(s => ({ id: s._id, key: s.key, title: s.title, body: s.body, createdAt: s.createdAt, updatedAt: s.updatedAt }))
      : [];
    const escrowPolicies = admin
      ? (await ctx.db.query("escrowPolicies").withIndex("by_created").order("desc").collect()).map(p => ({ id: p._id, policyName: p.policyName, type: p.type, releaseTime: p.releaseTime, createdAt: p.createdAt, updatedAt: p.updatedAt }))
      : [];
    const cancellationPolicies = admin
      ? (await ctx.db.query("cancellationPolicies").withIndex("by_created").order("desc").collect()).map(p => ({ id: p._id, ruleName: p.ruleName, refundType: p.refundType, refundPercent: p.refundPercent, window: p.window, createdAt: p.createdAt, updatedAt: p.updatedAt }))
      : [];
    const kycTiers = admin
      ? (await ctx.db.query("kycTiers").withIndex("by_created").order("desc").collect()).map(t => ({ id: t._id, tierName: t.tierName, requirements: t.requirements, maxShipmentValueNaira: t.maxShipmentValueNaira, maxCapacityKg: t.maxCapacityKg, description: t.description, createdAt: t.createdAt, updatedAt: t.updatedAt }))
      : [];
    const adminRoles = admin
      ? (await ctx.db.query("adminRoles").withIndex("by_created").order("desc").collect()).map(r => ({ id: r._id, name: r.name, memberCount: 0 }))
      : [];
    const teamMembers = admin
      ? (await ctx.db.query("teamMembers").collect()).map(m => ({ id: m._id, adminRoleId: m.adminRoleId, name: m.name, email: m.email, roleTitle: m.roleTitle, mustChangePassword: m.mustChangePassword }))
      : [];
    for (const role of adminRoles) role.memberCount = teamMembers.filter(m => m.adminRoleId === role.id).length;
    const permissions = admin
      ? (await ctx.db.query("permissions").withIndex("by_created").collect()).map(p => ({ id: p._id, name: p.name }))
      : [];
    const permissionGrants = admin
      ? (await ctx.db.query("permissionGrants").collect()).map(g => ({ id: g._id, permissionId: g.permissionId, adminRoleId: g.adminRoleId, roleTitle: g.roleTitle, granted: g.granted }))
      : [];
    const securityEvents = admin
      ? await ctx.db.query("securityEvents").withIndex("by_created").order("desc").take(300)
      : [];
    const suspiciousMap = new Map<string, { name: string; email?: string; phone?: string; attempts: number }>();
    for (const event of securityEvents) {
      if (event.kind !== "failed_login") continue;
      const key = event.actorEmail ?? event.actorName;
      const current = suspiciousMap.get(key);
      if (current) current.attempts += event.attempts ?? 1;
      else suspiciousMap.set(key, { name: event.actorName, email: event.actorEmail, phone: event.actorPhone, attempts: event.attempts ?? 1 });
    }
    const suspiciousAccounts = [...suspiciousMap.entries()]
      .map(([key, item], index) => ({ id: `sus-${index}-${key}`, ...item }))
      .sort((a, b) => b.attempts - a.attempts);
    const prettyDateTime = (value: number) => {
      const date = new Date(value);
      const month = date.toLocaleDateString("en-US", { month: "short" });
      return `${month} ${date.getDate()}, ${date.getFullYear()}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };
    const adminLogins = securityEvents.filter(event => event.kind === "login").map(event => ({
      id: event._id,
      name: event.actorName,
      dateTime: prettyDateTime(event.createdAt),
      ipAddress: event.ipAddress,
      deviceInfo: event.deviceInfo,
      location: event.location,
    }));
    const adminActions = securityEvents.filter(event => event.kind === "admin_action").map(event => ({
      id: event._id,
      name: event.actorName,
      dateTime: prettyDateTime(event.createdAt),
      actionTaken: event.detail,
      affectedSection: event.affectedSection,
      ipAddress: event.ipAddress,
    }));
    const feeConfigRows = await ctx.db.query("feeConfig").collect();
    const feeConfigDoc = feeConfigRows[0];
    const feeConfig = feeConfigDoc
      ? { platformFeePercent: feeConfigDoc.platformFeePercent, baseFeeNaira: feeConfigDoc.baseFeeNaira, distanceRateNairaPerKm: feeConfigDoc.distanceRateNairaPerKm, minFeeNaira: feeConfigDoc.minFeeNaira ?? 2000, categoryMultipliers: feeConfigDoc.categoryMultipliers as Record<string, number> | undefined, weightMultipliers: feeConfigDoc.weightMultipliers as { minKg: number; maxKg: number; multiplier: number }[] | undefined, updatedAt: feeConfigDoc.updatedAt }
      : { platformFeePercent: 10, baseFeeNaira: 1400, distanceRateNairaPerKm: 17, minFeeNaira: 2000, updatedAt: 0 };

    let viewerPermissions: PermissionKey[] = [];
    if (isAdmin(viewer)) {
      viewerPermissions = Object.values(PERMISSIONS);
    } else {
      const viewerEmail = (viewer.email ?? "").toLowerCase();
      const member = teamMembers.find(m => m.email.toLowerCase() === viewerEmail);
      if (member) {
        const grantedPermissionIds = new Set(
          permissionGrants
            .filter(g => g.adminRoleId === member.adminRoleId && g.roleTitle === member.roleTitle && g.granted)
            .map(g => g.permissionId)
        );
        viewerPermissions = permissions.filter(p => grantedPermissionIds.has(p.id)).map(p => p.name) as PermissionKey[];
      }
    }

    const viewerPerson = await personDto(ctx, viewer, true);
    const viewerMemberEmail = (viewer.email ?? "").toLowerCase();
    const viewerMemberRecord = admin ? (await ctx.db.query("teamMembers").collect()).find(m => m.email.toLowerCase() === viewerMemberEmail) : undefined;

    return {
      viewer: viewerMemberRecord ? { ...viewerPerson, mustChangePassword: viewerMemberRecord.mustChangePassword ?? false } : viewerPerson,
      people: await Promise.all(users.map(u => personDto(ctx, u, admin || u._id === viewer._id, isCompliance(viewer) || u._id === viewer._id))),
      trips,
      shipments: await Promise.all(selected.map(s => shipmentDto(ctx, s, admin || participant(s, viewer)))),
      events: events.map(e => ({ id: e._id, shipmentId: e.shipmentId, actorName: e.actorName, action: e.action, detail: e.detail, createdAt: e.createdAt })),
      disputes: disputes.map(d => ({ id: d._id, shipmentId: d.shipmentId, reason: d.reason, status: d.status, createdAt: d.createdAt, previousStatus: d.previousStatus, resolution: d.resolution, note: d.note, informationRequest: d.informationRequest, resolvedAt: d.resolvedAt })),
      offers: await Promise.all(offers.map(o => offerDto(ctx, o))),
      notifications: notifications.map(n => ({ id: n._id, title: n.title, body: n.body, shipmentId: n.shipmentId, createdAt: n.createdAt, readAt: n.readAt })),
      serviceArea,
      walletTransactions: walletTransactions.map(t => ({
        id: t._id,
        userId: t.userId,
        kind: t.kind,
        amountNaira: t.amountNaira,
        reference: t.reference,
        shipmentId: t.shipmentId,
        createdAt: t.createdAt,
        note: t.note,
      })),
      reviews: reviews.map(review => ({ id: review._id, shipmentId: review.shipmentId, authorId: review.authorId, targetId: review.targetId, rating: review.rating, comment: review.comment, createdAt: review.createdAt })),
      supportChats,
      supportMessages,
      faqs,
      settings,
      feeConfig,
      escrowPolicies,
      cancellationPolicies,
      kycTiers,
      adminRoles,
      teamMembers,
      permissions,
      permissionGrants,
      suspiciousAccounts,
      adminLogins,
      adminActions,
      viewerPermissions,
    };
  },
});

export const createShipment = mutation({
  args: {
    origin: v.string(),
    destination: v.string(),
    description: v.string(),
    category: v.string(),
    weightKg: v.number(),
    valueNaira: v.number(),
    receiverName: v.string(),
    receiverPhone: v.string(),
    pickupInstructions: v.string(),
    dropoffInstructions: v.string(),
    readyAt: v.number(),
    preferredPickupAt: v.optional(v.number()),
    pickupFlexBeforeMinutes: v.optional(v.number()),
    pickupFlexAfterMinutes: v.optional(v.number()),
    deliveryDeadline: v.number(),
    evidenceIds: v.array(v.id("evidence")),
    safetyConsent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireVerified(user);
    await assertSupportedRoute(ctx, args.origin, args.destination);
    validateShipment(args satisfies CreateShipmentInput);
    const limits = await getTierLimits(ctx, user);
    if (args.valueNaira > limits.maxShipmentValueNaira) {
      fail(`Your ${limits.tier} permits declaring parcel value up to ₦${limits.maxShipmentValueNaira.toLocaleString()}. Request a tier upgrade to send higher-value items.`);
    }
    await validateEvidence(ctx, args.evidenceIds, user._id, "parcel");

    const feeConfig = await getFeeConfig(ctx);
    const feeNaira = calculateDeliveryFee(args, feeConfig);
    const balance = user.walletBalanceNaira ?? 0;
    if (balance < feeNaira) fail(`Insufficient wallet balance. You have ₦${balance.toLocaleString()} but ₦${feeNaira.toLocaleString()} is required for this parcel. Top up your wallet to continue.`);

    const now = Date.now();
    const id = await ctx.db.insert("shipments", {
      ...args,
      origin: args.origin.trim(),
      destination: args.destination.trim(),
      description: args.description.trim(),
      receiverName: args.receiverName.trim(),
      receiverPhone: args.receiverPhone.trim(),
      pickupInstructions: args.pickupInstructions.trim(),
      dropoffInstructions: args.dropoffInstructions.trim(),
      senderId: user._id,
      feeNaira,
      reference: "Pending",
      status: "pending_review",
      paymentStatus: "held",
      approved: false,
      reservationActive: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, { reference: `PSG-${id.slice(-10).toUpperCase()}` });
    await deductForShipment(ctx, user, id, feeNaira);
    await audit(ctx, user, "shipment.created", `Package submitted for safety review with ₦${feeNaira.toLocaleString()} delivery fee held from wallet.`, id);
    return id;
  },
});

export const createTrip = mutation({ args: tripArgs, handler: async (ctx, args) => createTripDefinition.handler(ctx, args) });

export const matchShipment = mutation({
  args: {
    shipmentId: v.id("shipments"),
    tripId: v.id("trips"),
    expiresAt: v.number(),
    note: v.string(),
  },
  handler: async (ctx, args) => proposeOffer(ctx, args),
});

export const cancelShipment = mutation({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const s = await shipment(ctx, args.shipmentId);
    requireSender(s, user);
    if (await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).first()) fail("Payment has been initialized; open a dispute for reconciliation instead.");
    if (!["pending_review", "rejected", "open", "matched", "funded"].includes(s.status)) fail("This shipment cannot be cancelled; contact support or open a dispute.");
    if (s.paymentStatus === "held") {
      await refundForShipment(ctx, user, s._id, s.feeNaira, "Sender cancelled parcel");
      await ctx.db.patch(s._id, { paymentStatus: "refunded" });
    }
    await transition(ctx, s, "cancelled");
    await releaseCapacity(ctx, s);
    await audit(ctx, user, "shipment.cancelled", `Sender cancelled parcel. ${s.paymentStatus === "held" ? "Held fee refunded to wallet." : ""}`, s._id);
  },
});
