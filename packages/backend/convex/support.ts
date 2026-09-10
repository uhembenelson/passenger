import { v } from "convex/values";
import { query, mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { effectiveChatStatus, isAdmin, isCompliance, isStaff, personDto, requireUser, shipmentDto, tripDto, audit, closeResolvedChatAfterMs, fail } from "./lib";
import type { SupportUserDetails, SupportActivityEntry, AgentScoreboardEntry } from "@passenger/core";

export const getUserDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<SupportUserDetails | null> => {
    const viewer = await requireUser(ctx);
    if (!isStaff(viewer)) return null;

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
    if (!isAdmin(viewer)) return [];
    const chats = await ctx.db.query("supportChats").withIndex("by_last_message").order("desc").collect();
    return Promise.all(chats.map(async (chat) => {
      const user = await ctx.db.get(chat.userId);
      const messages = await ctx.db.query("supportMessages").withIndex("by_chat", q => q.eq("chatId", chat._id)).order("desc").take(1);
      return {
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

export const getMessages = query({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
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
        createdAt: msg.createdAt,
        isAdmin: author?.verification === "verified" && (author as any).role === "admin",
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
    const now = Date.now();
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return { claimed: false, error: "Chat not found" };
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
    if (!isAdmin(viewer)) fail("Admins only.");
    const now = Date.now();
    await ctx.db.patch(args.chatId, {
      assignedTo: args.newAgentId,
      assignedByName: args.newAgentName,
      activeViewedBy: args.newAgentId,
      activeViewedAt: now,
    });
    const chat = await ctx.db.get(args.chatId);
    await logSupportEvent(ctx, args.chatId, viewer, "handover", `Handed over to ${args.newAgentName} from ${chat?.assignedByName ?? "nobody"}`);
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
    await sweepClosedChats(ctx);
    const chat = await ctx.db.get(args.chatId);
    await ctx.db.insert("supportMessages", {
      chatId: args.chatId,
      authorId: viewer._id,
      body: args.body,
      createdAt: Date.now(),
    });
    if (chat && viewer._id === chat.userId && chat.status !== "unresolved") {
      await ctx.db.patch(args.chatId, { status: "unresolved", closedAt: undefined });
      await logSupportEvent(ctx, args.chatId, viewer, "reopen", "Reopened by customer reply");
    }
    await ctx.db.patch(args.chatId, { lastMessageAt: Date.now() });
    if (chat && viewer._id !== chat.userId) {
      if (chat.status === "unresolved" && !chat.assignedTo) {
        await ctx.db.patch(args.chatId, { assignedTo: viewer._id, assignedByName: viewer.name });
      }
      await ctx.db.patch(args.chatId, { activeViewedBy: viewer._id, activeViewedAt: Date.now() });
      if (isAdmin(viewer)) {
        await logSupportEvent(ctx, args.chatId, viewer, "message", args.body.slice(0, 200));
      }
    }
  },
});

export const markResolved = mutation({
  args: { chatId: v.id("supportChats"), resolution: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
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
    await audit(ctx, viewer, "support.resolve", `Resolved support chat for ${chat?.userId}: ${args.resolution} — ${args.note}`);
    await logSupportEvent(ctx, args.chatId, viewer, "resolve", `${args.resolution} — ${args.note}`);
  },
});

export const reopenChat = mutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    await sweepClosedChats(ctx);
    await ctx.db.patch(args.chatId, { status: "unresolved", closedAt: undefined, resolvedAt: undefined });
    const chat = await ctx.db.get(args.chatId);
    await audit(ctx, viewer, "support.reopen", `Reopened support chat for ${chat?.userId}`);
    await logSupportEvent(ctx, args.chatId, viewer, "reopen", "Reopened");
  },
});

export const qaReview = mutation({
  args: { chatId: v.id("supportChats"), score: v.union(v.literal("approved"), v.literal("needs_work")), note: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    if (!isAdmin(viewer)) fail("Admins only.");
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
    if (!isAdmin(viewer)) return [];
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
    if (!isAdmin(viewer)) return [];
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
  args: { userId: v.id("users"), subject: v.optional(v.string()), body: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const now = Date.now();
    await sweepClosedChats(ctx, now);
    const chatId = await ctx.db.insert("supportChats", {
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
      createdAt: now,
    });
    return chatId;
  },
});
