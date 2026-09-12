import { validateEvidence } from "./evidence";
import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { effectiveChatStatus, isAdmin, isCompliance, isStaff, hasPermission, personDto, requireUser, shipmentDto, tripDto, audit, closeResolvedChatAfterMs, fail, notify } from "./lib";
import type { SupportUserDetails, SupportActivityEntry, AgentScoreboardEntry } from "@passenger/core";

const contextArgs = {
  contextKind: v.optional(v.union(v.literal("delivery"), v.literal("trip"), v.literal("other"))),
  shipmentId: v.optional(v.id("shipments")),
  tripId: v.optional(v.id("trips")),
};
type ContextInput = { contextKind?: "delivery" | "trip" | "other"; shipmentId?: Id<"shipments">; tripId?: Id<"trips"> };
async function validateContext(ctx: QueryCtx | MutationCtx, userId: Id<"users">, input: ContextInput) {
  const kind = input.contextKind ?? "other";
  if (kind === "delivery") {
    if (!input.shipmentId || input.tripId) fail("Select a delivery for this request.");
    const shipment = await ctx.db.get(input.shipmentId);
    if (!shipment || (shipment.senderId !== userId && shipment.travellerId !== userId)) fail("Choose one of your deliveries.");
  } else if (kind === "trip") {
    if (!input.tripId || input.shipmentId) fail("Select a trip for this request.");
    const trip = await ctx.db.get(input.tripId);
    if (!trip || trip.travellerId !== userId) fail("Choose one of your trips.");
  } else if (input.shipmentId || input.tripId) fail("Other issues cannot include a delivery or trip.");
}

export const getUserDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<SupportUserDetails | null> => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW))) return null;

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const [sentRaw, carriedRaw, tripsRaw, walletRaw, reviewsReceivedRaw, reviewsGivenRaw, chatsRaw, notificationsRaw, auditsRaw] = await Promise.all([
      ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", args.userId)).collect(),
      ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", args.userId)).collect(),
      ctx.db.query("trips").withIndex("by_traveller", q => q.eq("travellerId", args.userId)).collect(),
      ctx.db.query("walletTransactions").withIndex("by_user", q => q.eq("userId", args.userId)).collect(),
      ctx.db.query("reviews").withIndex("by_target", q => q.eq("targetId", args.userId)).collect(),
      ctx.db.query("reviews").withIndex("by_author", q => q.eq("authorId", args.userId)).collect(),
      ctx.db.query("supportChats").withIndex("by_user", q => q.eq("userId", args.userId)).collect(),
      ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", args.userId)).collect(),
      ctx.db.query("audits").withIndex("by_created").order("desc").take(200),
    ]);

    const shipmentsRaw = [...new Map([...sentRaw, ...carriedRaw].map(s => [s._id, s])).values()].sort((a, b) => b.createdAt - a.createdAt);
    const shipmentIds = new Set(shipmentsRaw.map(s => s._id));
    const activeStatuses = ["open", "matched", "funded", "in_transit"];

    const disputes = (await ctx.db.query("disputes").collect())
      .filter(d => shipmentIds.has(d.shipmentId))
      .sort((a, b) => b.createdAt - a.createdAt);
    const reviewsReceived = [...reviewsReceivedRaw].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    const reviewsGiven = [...reviewsGivenRaw].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);

    return {
      user: await personDto(ctx, user, true, isCompliance(viewer)),
      stats: {
        shipmentsSent: sentRaw.length,
        shipmentsCarried: carriedRaw.length,
        activeShipments: shipmentsRaw.filter(s => activeStatuses.includes(s.status)).length,
        trips: tripsRaw.length,
        activeTrips: tripsRaw.filter(t => t.status === "active").length,
        openDisputes: disputes.filter(d => d.status === "open").length,
        openChats: chatsRaw.filter(c => effectiveChatStatus(c) === "unresolved").length,
        walletBalanceNaira: user.walletBalanceNaira ?? 0,
      },
      shipments: await Promise.all(shipmentsRaw.map(s => shipmentDto(ctx, s, true))),
      trips: await Promise.all(tripsRaw.map(t => tripDto(ctx, t))),
      walletTransactions: [...walletRaw].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(t => ({
        id: t._id, userId: t.userId, kind: t.kind, amountNaira: t.amountNaira, reference: t.reference, shipmentId: t.shipmentId, createdAt: t.createdAt, note: t.note,
      })),
      reviewsReceived: reviewsReceived.map(r => ({ id: r._id, shipmentId: r.shipmentId, authorId: r.authorId, targetId: r.targetId, rating: r.rating, comment: r.comment, createdAt: r.createdAt })),
      reviewsGiven: reviewsGiven.map(r => ({ id: r._id, shipmentId: r.shipmentId, authorId: r.authorId, targetId: r.targetId, rating: r.rating, comment: r.comment, createdAt: r.createdAt })),
      disputes: disputes.map(d => ({ id: d._id, shipmentId: d.shipmentId, reason: d.reason, status: d.status, createdAt: d.createdAt, previousStatus: d.previousStatus, resolution: d.resolution, note: d.note, informationRequest: d.informationRequest, resolvedAt: d.resolvedAt })),
      events: auditsRaw.filter(e => e.shipmentId && shipmentIds.has(e.shipmentId)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(e => ({ id: e._id, shipmentId: e.shipmentId, actorName: e.actorName, action: e.action, detail: e.detail, createdAt: e.createdAt })),
      notifications: [...notificationsRaw].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(n => ({ id: n._id, title: n.title, body: n.body, shipmentId: n.shipmentId, createdAt: n.createdAt, readAt: n.readAt })),
    };
  },
});

export const listChats = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW))) return [];
    const chats = await ctx.db.query("supportChats").withIndex("by_last_message").order("desc").collect();
    return Promise.all(chats.map(async (chat) => {
      const user = await ctx.db.get(chat.userId);
      const messages = await ctx.db.query("supportMessages").withIndex("by_chat", q => q.eq("chatId", chat._id)).order("desc").take(1);
      const related = chat.shipmentId ? await ctx.db.get(chat.shipmentId) : chat.tripId ? await ctx.db.get(chat.tripId) : null;
      const contextLabel = related ? `${related.origin} to ${related.destination}` : undefined;
      const contextReference = related && "reference" in related ? related.reference : chat.tripId ? `Trip ${chat.tripId.slice(-6)}` : undefined;
      return {
        contextLabel, contextReference,
        contextKind: chat.contextKind ?? "other", shipmentId: chat.shipmentId, tripId: chat.tripId, deletedAt: chat.deletedAt,
        id: chat._id,
        userId: chat.userId,
        userName: user?.name ?? "Unknown",
        userImage: user?.image,
        subject: chat.subject,
        status: effectiveChatStatus(chat),
        lastMessage: messages[0]?.body ?? "",
        lastMessageAt: chat.lastMessageAt,
        createdAt: chat.createdAt,
        resolvedAt: chat.resolvedAt,
        closedAt: chat.closedAt,
        resolution: chat.resolution,
        resolutionNote: chat.resolutionNote,
        assignedTo: chat.assignedTo,
        assignedByName: chat.assignedByName,
        resolvedBy: chat.resolvedBy,
        resolvedByName: chat.resolvedByName,
        qaReviewedBy: chat.qaReviewedBy,
        qaReviewedByName: chat.qaReviewedByName,
        qaScore: chat.qaScore,
        qaNote: chat.qaNote,
        qaReviewedAt: chat.qaReviewedAt,
        activeViewedBy: chat.activeViewedBy,
        activeViewedAt: chat.activeViewedAt,
      };
    }));
  },
});

// Customer requests share the operations inbox, without exposing staff notes.
export const myChats = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const chats = await ctx.db.query("supportChats").withIndex("by_user", q => q.eq("userId", viewer._id)).order("desc").take(100);
    return chats.filter(chat => !chat.deletedAt).map(chat => ({ id: chat._id, subject: chat.subject, status: effectiveChatStatus(chat), contextKind: chat.contextKind ?? "other", shipmentId: chat.shipmentId, tripId: chat.tripId, resolutionNote: chat.resolutionNote, lastMessageAt: chat.lastMessageAt })).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

export const getMessages = query({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat || (chat.userId !== viewer._id && !(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW)))) fail("Support request not found.");
    const messages = await ctx.db.query("supportMessages").withIndex("by_chat", q => q.eq("chatId", args.chatId)).order("asc").collect();
    return Promise.all(messages.map(async (msg) => {
      const author = await ctx.db.get(msg.authorId);
      return {
        id: msg._id,
        chatId: msg.chatId,
        authorId: msg.authorId,
        authorName: author?.name ?? "Unknown",
        authorImage: author?.image,
        body: msg.body,
        attachments: await Promise.all((msg.evidenceIds ?? []).map(async id => {
          const file = await ctx.db.get(id);
          return { id, filename: file?.filename ?? "Photo unavailable", url: file ? await ctx.storage.getUrl(file.storageId) : null };
        })),
        createdAt: msg.createdAt,
        isAdmin: msg.authorId !== chat.userId,
      };
    }));
  },
});

async function sweepClosedChats(ctx: MutationCtx, now = Date.now()) {
  const stale = await ctx.db.query("supportChats").withIndex("by_status", q => q.eq("status", "resolved")).collect();
  await Promise.all(stale
    .filter(c => c.resolvedAt && now - c.resolvedAt >= closeResolvedChatAfterMs)
    .map(c => ctx.db.patch(c._id, { status: "closed", closedAt: now })));
  const stalePresence = await ctx.db.query("supportChats").collect();
  await Promise.all(stalePresence
    .filter(c => c.activeViewedBy && c.activeViewedAt && now - c.activeViewedAt >= 5 * 60 * 1000)
    .map(c => ctx.db.patch(c._id, { activeViewedBy: undefined, activeViewedAt: undefined })));
}

const PRESENCE_TIMEOUT_MS = 5 * 60 * 1000;

export const claimView = mutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    const now = Date.now();
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.deletedAt) return { claimed: false, error: "Chat not found" };
    if (chat.activeViewedBy && chat.activeViewedAt && now - chat.activeViewedAt < PRESENCE_TIMEOUT_MS && chat.activeViewedBy !== viewer._id) {
      const current = await ctx.db.get(chat.activeViewedBy);
      return { claimed: false, currentViewer: current?.name ?? "Another agent", currentViewerId: chat.activeViewedBy };
    }
    await ctx.db.patch(args.chatId, { activeViewedBy: viewer._id, activeViewedAt: now });
    return { claimed: true };
  },
});

export const releaseView = mutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    const chat = await ctx.db.get(args.chatId);
    if (chat?.activeViewedBy === viewer._id) {
      await ctx.db.patch(args.chatId, { activeViewedBy: undefined, activeViewedAt: undefined });
    }
  },
});

export const handover = mutation({
  args: { chatId: v.id("supportChats"), newAgentId: v.id("users"), newAgentName: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Admins only.");
    const agent = await ctx.db.get(args.newAgentId);
    if (!agent || agent.suspended || !(await hasPermission(ctx, agent, PERMISSIONS.SUPPORT_MANAGE))) fail("Choose an active support agent.");
    const previous = await ctx.db.get(args.chatId);
    if (!previous || previous.deletedAt) fail("Support request not found.");
    const now = Date.now();
    await ctx.db.patch(args.chatId, {
      assignedTo: args.newAgentId,
      assignedByName: agent.name,
      activeViewedBy: args.newAgentId,
      activeViewedAt: now,
    });
    const chat = await ctx.db.get(args.chatId);
    await logSupportEvent(ctx, args.chatId, viewer, "handover", `Handed over to ${agent.name} from ${previous.assignedByName ?? "nobody"}`);
  },
});

async function logSupportEvent(ctx: MutationCtx, chatId: Id<"supportChats">, viewer: Doc<"users">, action: string, detail: string) {
  await ctx.db.insert("supportEvents", {
    chatId,
    actorId: viewer._id,
    actorName: viewer.name,
    action,
    detail,
    createdAt: Date.now(),
  });
}

export const sendMessage = mutation({
  args: { chatId: v.id("supportChats"), body: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat || (chat.userId !== viewer._id && !(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE)))) fail("Support request not found.");
    if (chat.deletedAt) fail("This request has been archived. Restore it before replying.");
    if (!args.body.trim() || args.body.trim().length > 2000) fail("Messages must contain 1 to 2,000 characters.");
    await ctx.db.insert("supportMessages", {
      chatId: args.chatId,
      authorId: viewer._id,
      body: args.body,
      createdAt: Date.now(),
    });
    if (chat && viewer._id === chat.userId && chat.status !== "unresolved") {
      await ctx.db.patch(args.chatId, { status: "unresolved", closedAt: undefined, resolvedAt: undefined, resolution: undefined, resolutionNote: undefined, resolvedBy: undefined, resolvedByName: undefined, qaReviewedAt: undefined, qaScore: undefined, qaNote: undefined, qaReviewedBy: undefined, qaReviewedByName: undefined });
      await logSupportEvent(ctx, args.chatId, viewer, "reopen", "Reopened by customer reply");
    }
    await ctx.db.patch(args.chatId, { lastMessageAt: Date.now() });
    if (chat && viewer._id !== chat.userId) {
      if (chat.status === "unresolved" && !chat.assignedTo) {
        await ctx.db.patch(args.chatId, { assignedTo: viewer._id, assignedByName: viewer.name });
      }
      await ctx.db.patch(args.chatId, { activeViewedBy: viewer._id, activeViewedAt: Date.now() });
      await notify(ctx, chat.userId, "Support replied", "You have a new reply in your support request.", chat.shipmentId);
      if (isStaff(viewer)) {
        await logSupportEvent(ctx, args.chatId, viewer, "message", args.body.slice(0, 200));
      }
    }
  },
});

export const markResolved = mutation({
  args: { chatId: v.id("supportChats"), resolution: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    if (!args.resolution.trim() || !args.note.trim() || args.note.length > 2000) fail("Add a resolution and a note of up to 2,000 characters.");
    const request = await ctx.db.get(args.chatId);
    if (!request || request.deletedAt) fail("Support request not found.");
    const now = Date.now();
    await sweepClosedChats(ctx, now);
    await ctx.db.patch(args.chatId, {
      status: "resolved",
      resolution: args.resolution,
      resolutionNote: args.note,
      resolvedAt: now,
      closedAt: undefined,
      resolvedBy: viewer._id,
      resolvedByName: viewer.name,
    });
    const chat = await ctx.db.get(args.chatId);
    await notify(ctx, request.userId, "Support request resolved", args.note.trim(), request.shipmentId);
    await audit(ctx, viewer, "support.resolve", `Resolved support chat for ${chat?.userId}: ${args.resolution} — ${args.note}`);
    await logSupportEvent(ctx, args.chatId, viewer, "resolve", `${args.resolution} — ${args.note}`);
  },
});

export const reopenChat = mutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    const request = await ctx.db.get(args.chatId);
    if (!request || request.deletedAt) fail("Support request not found.");
    await sweepClosedChats(ctx);
    await ctx.db.patch(args.chatId, { status: "unresolved", closedAt: undefined, resolvedAt: undefined, resolution: undefined, resolutionNote: undefined, resolvedBy: undefined, resolvedByName: undefined, qaReviewedAt: undefined, qaScore: undefined, qaNote: undefined, qaReviewedBy: undefined, qaReviewedByName: undefined });
    const chat = await ctx.db.get(args.chatId);
    await audit(ctx, viewer, "support.reopen", `Reopened support chat for ${chat?.userId}`);
    await logSupportEvent(ctx, args.chatId, viewer, "reopen", "Reopened");
  },
});

export const qaReview = mutation({
  args: { chatId: v.id("supportChats"), score: v.union(v.literal("approved"), v.literal("needs_work")), note: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Admins only.");
    const request = await ctx.db.get(args.chatId);
    if (!request || request.deletedAt || effectiveChatStatus(request) === "unresolved") fail("Resolve the request before reviewing its handling.");
    if (args.note.length > 2000 || (args.score === "needs_work" && !args.note.trim())) fail("Add a review note of up to 2,000 characters.");
    const now = Date.now();
    await ctx.db.patch(args.chatId, {
      qaReviewedBy: viewer._id,
      qaReviewedByName: viewer.name,
      qaScore: args.score,
      qaNote: args.note,
      qaReviewedAt: now,
    });
    const chat = await ctx.db.get(args.chatId);
    await audit(ctx, viewer, "support.qa_review", `QA ${args.score} on support chat for ${chat?.userId}: ${args.note}`);
    await logSupportEvent(ctx, args.chatId, viewer, "qa_review", `${args.score} — ${args.note}`);
  },
});

export const supportActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SupportActivityEntry[]> => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW))) return [];
    const events = await ctx.db.query("supportEvents").withIndex("by_created").order("desc").take(args.limit ?? 200);
    return events.map(e => ({
      id: e._id, chatId: e.chatId, actorId: e.actorId, actorName: e.actorName, action: e.action, detail: e.detail, createdAt: e.createdAt,
    }));
  },
});

export const agentScoreboard = query({
  args: {},
  handler: async (ctx): Promise<AgentScoreboardEntry[]> => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW))) return [];
    const [chats, messages, events] = await Promise.all([
      ctx.db.query("supportChats").collect(),
      ctx.db.query("supportMessages").collect(),
      ctx.db.query("supportEvents").withIndex("by_created").order("desc").collect(),
    ]);
    const byChat = new Map<Id<"supportChats">, typeof messages>();
    for (const m of messages) {
      const list = byChat.get(m.chatId) ?? [];
      list.push(m);
      byChat.set(m.chatId, list);
    }
    const agents = new Map<string, AgentScoreboardEntry>();
    const bump = (name: string, mutate: (row: AgentScoreboardEntry) => void) => {
      const key = name || "Unassigned";
      let row = agents.get(key);
      if (!row) {
        row = { agentName: key, openAssigned: 0, resolved: 0, reopened: 0, avgFirstResponseMs: null, qaTotal: 0, qaApproved: 0, qaNeedsWork: 0 };
        agents.set(key, row);
      }
      mutate(row);
    };
    for (const chat of chats) {
      const state = effectiveChatStatus(chat);
      const agentName = chat.assignedByName ?? chat.resolvedByName ?? "Unassigned";
      const thread = byChat.get(chat._id) ?? [];
      const firstAdminReply = thread
        .filter(m => m.authorId !== chat.userId)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      const responseMs = firstAdminReply ? firstAdminReply.createdAt - chat.createdAt : null;
      if (chat.assignedByName) {
        bump(chat.assignedByName, row => {
          if (state === "unresolved") row.openAssigned += 1;
          if (responseMs !== null && firstAdminReply) row.avgFirstResponseMs = row.avgFirstResponseMs === null ? responseMs : (row.avgFirstResponseMs + responseMs) / 2;
        });
      }
      if (chat.resolvedAt) {
        bump(chat.resolvedByName ?? agentName, row => { row.resolved += 1; });
      }
      const qaName = chat.qaReviewedByName;
      if (qaName) {
        bump(qaName, row => {
          row.qaTotal += 1;
          if (chat.qaScore === "approved") row.qaApproved += 1;
          if (chat.qaScore === "needs_work") row.qaNeedsWork += 1;
        });
      }
    }
    for (const ev of events) {
      if (ev.action === "reopen") {
        bump(ev.actorName, row => { row.reopened += 1; });
      }
    }
    return [...agents.values()].sort((a, b) => (b.resolved + b.reopened) - (a.resolved + a.reopened));
  },
});

export const createChat = mutation({
  args: { userId: v.id("users"), subject: v.optional(v.string()), body: v.string(), evidenceIds: v.optional(v.array(v.id("evidence"))), ...contextArgs },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (args.userId !== viewer._id && !(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("You can only create your own support requests.");
    if (!args.body.trim() || args.body.trim().length > 2000) fail("Messages must contain 1 to 2,000 characters.");
    if (args.subject && args.subject.length > 160) fail("Subject is too long.");
    if (!(await ctx.db.get(args.userId))) fail("Customer not found.");
    await validateContext(ctx, args.userId, args);
    if (args.evidenceIds?.length) await validateEvidence(ctx, args.evidenceIds, viewer._id, "parcel");
    const now = Date.now();
    const chatId = await ctx.db.insert("supportChats", {
      contextKind: args.contextKind ?? "other",
      shipmentId: args.shipmentId,
      tripId: args.tripId,
      userId: args.userId,
      subject: args.subject,
      status: "unresolved",
      lastMessageAt: now,
      createdAt: now,
    });
    await ctx.db.insert("supportMessages", {
      chatId,
      authorId: viewer._id,
      body: args.body,
      evidenceIds: args.evidenceIds,
      createdAt: now,
    });
    await logSupportEvent(ctx, chatId, viewer, "created", "Support request created");
    return chatId;
  },
});

export const contextOptions = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const userId = args.userId ?? viewer._id;
    if (userId !== viewer._id && !(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support permission required.");
    const [sent, carried, trips] = await Promise.all([
      ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", userId)).collect(),
      ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", userId)).collect(),
      ctx.db.query("trips").withIndex("by_traveller", q => q.eq("travellerId", userId)).collect(),
    ]);
    return {
      deliveries: [...new Map([...sent, ...carried].map(item => [item._id, item])).values()].sort((a, b) => b.createdAt - a.createdAt).map(item => ({ id: item._id, reference: item.reference, origin: item.origin, destination: item.destination, status: item.status, date: item.createdAt, past: ["delivered", "cancelled", "rejected"].includes(item.status) })),
      trips: trips.sort((a, b) => b.departureAt - a.departureAt).map(item => ({ id: item._id, reference: `Trip ${item._id.slice(-6)}`, origin: item.origin, destination: item.destination, status: item.status ?? "active", date: item.departureAt, past: item.status === "completed" || item.status === "cancelled" || (item.arrivalAt ?? item.departureAt) < Date.now() })),
    };
  },
});

export const requestDetails = query({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const chat = await ctx.db.get(args.chatId);
    const staff = await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW);
    if (!chat || (chat.userId !== viewer._id && !staff)) fail("Support request not found.");
    const shipment = chat.shipmentId ? await ctx.db.get(chat.shipmentId) : null;
    const trip = chat.tripId ? await ctx.db.get(chat.tripId) : null;
    const user = staff ? await ctx.db.get(chat.userId) : null;
    const context = shipment ? {
      kind: "delivery" as const, id: shipment._id, reference: shipment.reference,
      origin: shipment.origin, destination: shipment.destination, status: shipment.status,
      date: shipment.createdAt, description: shipment.description,
      pickup: shipment.pickupInstructions, dropoff: shipment.dropoffInstructions,
      paymentStatus: shipment.paymentStatus, feeNaira: shipment.feeNaira,
      weightKg: shipment.weightKg,
    } : trip ? {
      kind: "trip" as const, id: trip._id, reference: `Trip ${trip._id.slice(-6)}`,
      origin: trip.origin, destination: trip.destination, status: trip.status ?? "active",
      date: trip.departureAt, arrivalAt: trip.arrivalAt, stops: trip.stops, capacityKg: trip.capacityKg,
    } : null;
    return { id: chat._id, userId: chat.userId, userName: user?.name, subject: chat.subject, status: effectiveChatStatus(chat), contextKind: chat.contextKind ?? "other", context, deletedAt: chat.deletedAt, assignedTo: chat.assignedTo, assignedByName: chat.assignedByName, resolution: chat.resolution, resolutionNote: chat.resolutionNote, createdAt: chat.createdAt };
  },
});

export const requestEvents = query({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW))) fail("Support permission required.");
    return ctx.db.query("supportEvents").withIndex("by_chat", q => q.eq("chatId", args.chatId)).order("desc").collect();
  },
});

export const agents = query({
  args: {},
  handler: async ctx => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_VIEW))) return [];
    const users = await ctx.db.query("users").collect();
    const eligible = await Promise.all(users.map(async user => (await hasPermission(ctx, user, PERMISSIONS.SUPPORT_MANAGE)) && !user.suspended ? { id: user._id, name: user.name } : null));
    return eligible.filter((user): user is NonNullable<typeof user> => user !== null);
  },
});

export const updateRequest = mutation({
  args: { chatId: v.id("supportChats"), subject: v.string(), ...contextArgs },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.deletedAt) fail("Support request not found.");
    if (!args.subject.trim() || args.subject.length > 160) fail("Enter a subject of up to 160 characters.");
    await validateContext(ctx, chat.userId, args);
    await ctx.db.patch(chat._id, { subject: args.subject.trim(), contextKind: args.contextKind ?? "other", shipmentId: args.shipmentId, tripId: args.tripId });
    await logSupportEvent(ctx, chat._id, viewer, "updated", "Updated request subject and context");
  },
});

export const setArchived = mutation({
  args: { chatId: v.id("supportChats"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    const chat = await ctx.db.get(args.chatId);
    if (!chat) fail("Support request not found.");
    if (args.archived && effectiveChatStatus(chat) === "unresolved") fail("Resolve the request before archiving it.");
    await ctx.db.patch(chat._id, { deletedAt: args.archived ? Date.now() : undefined });
    await logSupportEvent(ctx, chat._id, viewer, args.archived ? "archived" : "restored", args.archived ? "Archived request" : "Restored request");
  },
});

export const addNote = mutation({
  args: { chatId: v.id("supportChats"), body: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!(await hasPermission(ctx, viewer, PERMISSIONS.SUPPORT_MANAGE))) fail("Support management permission required.");
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.deletedAt) fail("Support request not found.");
    if (!args.body.trim() || args.body.length > 2000) fail("Notes must contain 1 to 2,000 characters.");
    await logSupportEvent(ctx, chat._id, viewer, "internal_note", args.body.trim());
  },
});
