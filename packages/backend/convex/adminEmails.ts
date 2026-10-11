import { v } from "convex/values";
import { DEFAULT_EMAIL_DESIGN, DEFAULT_EMAIL_FOOTER, EMAIL_AUDIENCES, PERMISSIONS, renderEmailDocument, type EmailBlock, type EmailDesign, type EmailFooter } from "@passenger/core";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { emailBlock, emailDesign, emailFooter } from "./schema";
import { audit, fail, requireAdmin, requirePermission, requireUser } from "./lib";
import { sendBrandedEmail } from "./emails";

// Audiences available when composing a broadcast email from the admin
// dashboard. Kept as plain strings so the stored value stays readable. The
// canonical list lives in @passenger/core so the admin UI and the backend
// always agree on what is available.
export { EMAIL_AUDIENCES };
type EmailAudience = typeof EMAIL_AUDIENCES[number];

// A resolved recipient is a snapshot of email plus display name, regardless of
// whether the person is a Passenger account or an outside address on a list.
export interface EmailRecipient {
  email: string;
  name?: string;
}

const BATCH_SIZE = 25;
const MAX_BLOCKS = 60;
const MAX_HEADING_LENGTH = 160;
const MAX_PARAGRAPH_LENGTH = 2500;
const MAX_ALT_LENGTH = 300;
const MAX_LABEL_LENGTH = 60;
const MAX_FOOTER_BRAND_LENGTH = 60;
const MAX_FOOTER_TAGLINE_LENGTH = 160;
const MAX_FOOTER_REASON_LENGTH = 300;
const MAX_FOOTER_ADDRESS_LENGTH = 200;
const MAX_FOOTER_LINK_LABEL = 40;
const MAX_FOOTER_LINKS = 6;

function assertAudience(audience: string): asserts audience is EmailAudience {
  if (!(EMAIL_AUDIENCES as readonly string[]).includes(audience)) fail("Choose a valid audience.");
}

// A one-off send can target a single address the admin types in instead of a
// saved audience. That address is stored in the audience field, so every place
// that resolves recipients has to recognise an email-shaped audience value.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmailAddress(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// Semantic checks the Convex validators cannot express: link safety, non-empty
// copy and length ceilings that keep a broadcast readable.
export function validateBlocks(blocks: EmailBlock[]) {
  if (blocks.length === 0) fail("Add at least one block to the email.");
  if (blocks.length > MAX_BLOCKS) fail(`A template can hold at most ${MAX_BLOCKS} blocks.`);
  for (const block of blocks) {
    if (block.type === "heading") {
      if (!block.text.trim()) fail("Every heading needs some text.");
      if (block.text.length > MAX_HEADING_LENGTH) fail(`Keep headings under ${MAX_HEADING_LENGTH} characters.`);
    } else if (block.type === "paragraph") {
      if (!block.text.trim()) fail("Every text block needs content.");
      if (block.text.length > MAX_PARAGRAPH_LENGTH) fail(`Keep text blocks under ${MAX_PARAGRAPH_LENGTH} characters.`);
    } else if (block.type === "image") {
      if (!isHttpUrl(block.url)) fail("Add an https image address to every image block.");
      if (block.alt.length > MAX_ALT_LENGTH) fail(`Keep image descriptions under ${MAX_ALT_LENGTH} characters.`);
      if (block.href && block.href.trim() && !isHttpUrl(block.href)) fail("Image links must start with https://.");
    } else if (block.type === "button") {
      if (!block.label.trim()) fail("Every button needs a label.");
      if (block.label.length > MAX_LABEL_LENGTH) fail(`Keep button labels under ${MAX_LABEL_LENGTH} characters.`);
      if (!isHttpUrl(block.href)) fail("Every button needs an https link.");
    }
  }
}

// The footer is part of the template data, so the same semantic checks apply:
// links must be safe and copy must stay short enough to read in a small space.
export function validateFooter(footer?: EmailFooter) {
  if (!footer) return;
  if (footer.brand.length > MAX_FOOTER_BRAND_LENGTH) fail(`Keep the footer brand name under ${MAX_FOOTER_BRAND_LENGTH} characters.`);
  if (footer.tagline.length > MAX_FOOTER_TAGLINE_LENGTH) fail(`Keep the footer tagline under ${MAX_FOOTER_TAGLINE_LENGTH} characters.`);
  if (footer.reason.length > MAX_FOOTER_REASON_LENGTH) fail(`Keep the footer note under ${MAX_FOOTER_REASON_LENGTH} characters.`);
  if (footer.address.length > MAX_FOOTER_ADDRESS_LENGTH) fail(`Keep the footer address under ${MAX_FOOTER_ADDRESS_LENGTH} characters.`);
  if (footer.links.length > MAX_FOOTER_LINKS) fail(`The footer can hold at most ${MAX_FOOTER_LINKS} links.`);
  for (const link of footer.links) {
    const label = link.label.trim();
    const href = link.href.trim();
    if (!label && !href) continue; // blank rows are dropped when saving
    if (!label) fail("Every footer link needs a label.");
    if (label.length > MAX_FOOTER_LINK_LABEL) fail(`Keep footer link labels under ${MAX_FOOTER_LINK_LABEL} characters.`);
    if (!isHttpUrl(href)) fail("Footer links must start with https://.");
  }
}

// Trim, collapse whitespace, drop blank/invalid links and clamp lengths so the
// stored footer always renders cleanly.
export function normalizeFooter(footer?: EmailFooter): EmailFooter {
  const merged = { ...DEFAULT_EMAIL_FOOTER, ...(footer ?? {}) };
  const clamp = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max);
  const links = (merged.links ?? [])
    .map(link => ({ label: clamp(link.label, MAX_FOOTER_LINK_LABEL), href: link.href.trim() }))
    .filter(link => link.label && isHttpUrl(link.href))
    .slice(0, MAX_FOOTER_LINKS);
  return {
    brand: clamp(merged.brand, MAX_FOOTER_BRAND_LENGTH),
    tagline: clamp(merged.tagline, MAX_FOOTER_TAGLINE_LENGTH),
    links,
    address: clamp(merged.address, MAX_FOOTER_ADDRESS_LENGTH),
    reason: clamp(merged.reason, MAX_FOOTER_REASON_LENGTH),
    align: merged.align === "center" || merged.align === "right" ? merged.align : "left",
    linkLayout: merged.linkLayout === "stacked" ? "stacked" : "inline",
  };
}

// Clamp layout values so a composed template always stays within a sensible,
// email-client-safe range regardless of what the builder sends.
export function normalizeDesign(design?: EmailDesign): EmailDesign {
  const merged = { ...DEFAULT_EMAIL_DESIGN, ...(design ?? {}) };
  const hex = (value: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback);
  return {
    width: Math.min(720, Math.max(480, Math.round(merged.width))),
    padding: Math.min(72, Math.max(16, Math.round(merged.padding))),
    background: hex(merged.background, DEFAULT_EMAIL_DESIGN.background),
    contentBackground: hex(merged.contentBackground, DEFAULT_EMAIL_DESIGN.contentBackground),
  };
}

function validateInput(args: { subject: string; blocks: EmailBlock[]; footer?: EmailFooter; scheduledFor?: number }) {
  const subject = args.subject.trim();
  if (subject.length < 3 || subject.length > 140) fail("Use a subject between 3 and 140 characters.");
  validateBlocks(args.blocks);
  validateFooter(args.footer);
  if (args.scheduledFor !== undefined && (!Number.isFinite(args.scheduledFor) || args.scheduledFor <= Date.now())) fail("Choose a future date and time to schedule this email.");
}

async function suppressedEmails(ctx: QueryCtx | MutationCtx): Promise<Set<string>> {
  const contacts = await ctx.db.query("emailContacts").collect();
  const set = new Set<string>();
  for (const contact of contacts) {
    if (contact.unsubscribedAt !== undefined) set.add(contact.email.toLowerCase());
  }
  return set;
}

// Resolve the eligible Passenger accounts for one of the built-in audiences
// (used by sends and by list imports). No suppression filtering here.
export async function resolveAudienceUsers(ctx: QueryCtx | MutationCtx, audience: string): Promise<EmailRecipient[]> {
  const users = await ctx.db.query("users").collect();
  const eligible = users.filter(user => typeof user.email === "string" && user.email.trim().length > 0 && !user.suspended);
  const pick = (list: typeof eligible) => list.map(user => ({ email: (user.email as string).trim(), name: user.name }));
  switch (audience) {
    case "All users":
      return pick(eligible);
    case "Tier-1 users":
      return pick(eligible.filter(user => user.tier === "Tier 1"));
    case "Tier-2 users":
      return pick(eligible.filter(user => user.tier === "Tier 2"));
    case "Tier-3 users":
      return pick(eligible.filter(user => user.tier === "Tier 3"));
    case "Drivers": {
      const trips = await ctx.db.query("trips").collect();
      const ids = new Set(trips.map(trip => trip.travellerId));
      return pick(eligible.filter(user => ids.has(user._id)));
    }
    case "Senders": {
      const shipments = await ctx.db.query("shipments").collect();
      const ids = new Set(shipments.map(shipment => shipment.senderId));
      return pick(eligible.filter(user => ids.has(user._id)));
    }
    case "Waitlist": {
      // Pre-launch signups who asked to hear from Passenger. They are not
      // accounts yet, so recipients are the raw waitlist addresses. Rows are
      // deduplicated and malformed addresses are skipped so a stray bad row
      // never fails a whole batch.
      const signups = await ctx.db.query("waitlistSignups").collect();
      const seen = new Set<string>();
      const members: EmailRecipient[] = [];
      for (const signup of signups) {
        const email = signup.email.trim().toLowerCase();
        if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        seen.add(email);
        const name = signup.name.trim();
        members.push(name ? { email, name } : { email });
      }
      return members;
    }
    default:
      return [];
  }
}

// Resolve the recipients for an audience, dropping addresses that have opted
// out of broadcasts. Lists resolve their membership; built-ins resolve users.
async function resolveRecipients(ctx: QueryCtx | MutationCtx, audience: string, listId?: Id<"emailLists">): Promise<EmailRecipient[]> {
  const suppressed = await suppressedEmails(ctx);
  const keep = (recipient: EmailRecipient) => !suppressed.has(recipient.email.toLowerCase());
  if (listId) {
    const members = await ctx.db.query("emailListMembers").withIndex("by_list", q => q.eq("listId", listId)).collect();
    return members
      .map(member => ({ email: member.email, name: member.name ?? undefined }))
      .filter(keep);
  }
  const trimmed = audience.trim();
  if (isEmailAddress(trimmed)) return [{ email: trimmed }].filter(keep);
  return (await resolveAudienceUsers(ctx, trimmed)).filter(keep);
}

async function resolveAudienceLabel(ctx: QueryCtx | MutationCtx, audience: string, listId?: Id<"emailLists">): Promise<string> {
  if (listId) {
    const list = await ctx.db.get(listId);
    if (!list) fail("Choose a valid email list.");
    return `List: ${list.name}`;
  }
  const trimmed = audience.trim();
  if (isEmailAddress(trimmed)) return trimmed;
  assertAudience(trimmed);
  return trimmed;
}

export const list = query({
  args: {},
  handler: async ctx => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    const emails = await ctx.db.query("adminEmails").withIndex("by_created").order("desc").collect();
    return emails.map(record => ({
      id: record._id,
      subject: record.subject,
      blocks: record.blocks,
      design: record.design,
      footer: record.footer,
      audience: record.audience,
      listId: record.listId,
      status: record.status,
      scheduledFor: record.scheduledFor,
      sentAt: record.sentAt,
      recipientCount: record.recipientCount,
      sentCount: record.sentCount,
      failedCount: record.failedCount,
      lastError: record.lastError,
      createdByName: record.createdByName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  },
});

export const audienceCount = query({
  args: { audience: v.string(), listId: v.optional(v.id("emailLists")) },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    if (args.listId) {
      if (!(await ctx.db.get(args.listId))) return 0;
      return (await resolveRecipients(ctx, "", args.listId)).length;
    }
    const trimmed = args.audience.trim();
    if (!isEmailAddress(trimmed) && !(EMAIL_AUDIENCES as readonly string[]).includes(trimmed)) return 0;
    return (await resolveRecipients(ctx, trimmed)).length;
  },
});

export const create = mutation({
  args: {
    subject: v.string(),
    blocks: v.array(emailBlock),
    design: v.optional(emailDesign),
    footer: v.optional(emailFooter),
    audience: v.string(),
    listId: v.optional(v.id("emailLists")),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const displayAudience = await resolveAudienceLabel(ctx, args.audience, args.listId);
    validateInput({ subject: args.subject, blocks: args.blocks, footer: args.footer, scheduledFor: args.scheduledFor });
    const now = Date.now();
    const scheduled = args.scheduledFor !== undefined;
    const emailId = await ctx.db.insert("adminEmails", {
      subject: args.subject.trim(),
      blocks: args.blocks,
      design: normalizeDesign(args.design),
      footer: normalizeFooter(args.footer),
      audience: displayAudience,
      listId: args.listId,
      status: scheduled ? "scheduled" : "draft",
      scheduledFor: args.scheduledFor,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      createdBy: viewer._id,
      createdByName: viewer.name,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, viewer, "admin_email.created", `Drafted admin email "${args.subject.trim()}" for ${displayAudience}${scheduled ? " (scheduled)" : ""}.`);
    return emailId;
  },
});

export const update = mutation({
  args: {
    id: v.id("adminEmails"),
    subject: v.string(),
    blocks: v.array(emailBlock),
    design: v.optional(emailDesign),
    footer: v.optional(emailFooter),
    audience: v.string(),
    listId: v.optional(v.id("emailLists")),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const record = await ctx.db.get(args.id);
    if (!record) fail("Email not found.");
    if (record.status === "sending" || record.status === "sent") fail("This email can no longer be edited.");
    const displayAudience = await resolveAudienceLabel(ctx, args.audience, args.listId);
    validateInput({ subject: args.subject, blocks: args.blocks, footer: args.footer, scheduledFor: args.scheduledFor });
    const scheduled = args.scheduledFor !== undefined;
    await ctx.db.patch(args.id, {
      subject: args.subject.trim(),
      blocks: args.blocks,
      design: normalizeDesign(args.design),
      footer: normalizeFooter(args.footer),
      audience: displayAudience,
      listId: args.listId,
      scheduledFor: args.scheduledFor,
      status: scheduled ? "scheduled" : "draft",
      updatedAt: Date.now(),
    });
    await audit(ctx, viewer, "admin_email.updated", `Updated admin email "${args.subject.trim()}".`);
  },
});

export const remove = mutation({
  args: { id: v.id("adminEmails") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const record = await ctx.db.get(args.id);
    if (!record) fail("Email not found.");
    if (record.status === "sending") fail("This email is currently sending and cannot be deleted.");
    await ctx.db.delete(args.id);
    await audit(ctx, viewer, "admin_email.deleted", `Deleted admin email "${record.subject}".`);
  },
});

// Admin-only upload helper for template images. The client posts the file to
// the returned URL, then calls resolveImage to turn the storage id into a
// public https address it can drop straight into an image block.
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    return await ctx.storage.generateUploadUrl();
  },
});

export const resolveImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) fail("That image could not be found.");
    return url;
  },
});

// Begin delivery for a draft or scheduled email: snapshot the resolved
// recipients and hand off to the resumable dispatch action.
export const sendNow = mutation({
  args: { id: v.id("adminEmails") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const record = await ctx.db.get(args.id);
    if (!record) fail("Email not found.");
    if (record.status === "sending") fail("This email is already sending.");
    if (record.status === "sent") fail("This email has already been sent.");
    const recipients = await resolveRecipients(ctx, record.audience, record.listId);
    if (recipients.length === 0) {
      if (!record.listId && isEmailAddress(record.audience)) fail("That address has opted out of broadcast emails.");
      fail("There are no recipients with an email address for this audience.");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "sending",
      scheduledFor: undefined,
      recipients,
      recipientCursor: 0,
      recipientCount: recipients.length,
      sentCount: 0,
      failedCount: 0,
      lastError: undefined,
      sentAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.adminEmails.dispatch, { emailId: args.id });
    await audit(ctx, viewer, "admin_email.sending", `Sending admin email "${record.subject}" to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.`);
    return { recipientCount: recipients.length };
  },
});

export const get = internalQuery({
  args: { emailId: v.id("adminEmails") },
  handler: async (ctx, args) => ctx.db.get(args.emailId),
});

export const recordProgress = internalMutation({
  args: {
    emailId: v.id("adminEmails"),
    sent: v.number(),
    failed: v.number(),
    nextCursor: v.number(),
    done: v.boolean(),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.emailId);
    if (!record) return;
    const sentCount = record.sentCount + args.sent;
    const failedCount = record.failedCount + args.failed;
    const now = Date.now();
    await ctx.db.patch(args.emailId, {
      recipientCursor: args.nextCursor,
      sentCount,
      failedCount,
      lastError: args.lastError ?? record.lastError,
      status: args.done ? (sentCount === 0 && failedCount > 0 ? "failed" : "sent") : "sending",
      sentAt: args.done ? now : undefined,
      updatedAt: now,
    });
  },
});

// Make sure every recipient address has an unsubscribe token. Tokens are
// stable per address so old links keep working and opt-outs are tracked.
export const ensureTokens = internalMutation({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, args) => {
    const unique = [...new Set(args.emails.map(email => email.trim().toLowerCase()))].filter(Boolean);
    const tokens = new Map<string, string>();
    for (const email of unique) {
      const contact = await ctx.db.query("emailContacts").withIndex("by_email", q => q.eq("email", email)).first();
      if (contact) tokens.set(email, contact.token);
    }
    const missing = unique.filter(email => !tokens.has(email));
    const now = Date.now();
    for (const email of missing) {
      const token = crypto.randomUUID();
      await ctx.db.insert("emailContacts", { email, token, createdAt: now });
      tokens.set(email, token);
    }
    return [...tokens.entries()].map(([email, token]) => ({ email, token }));
  },
});

// Sends a slice of the recipient list, then reschedules itself until the whole
// audience has been processed. Each run is small so that large audiences do not
// hit action timeouts. The unsubscribe link is personal to each recipient.
export const dispatch = internalAction({
  args: { emailId: v.id("adminEmails") },
  handler: async (ctx, args): Promise<void> => {
    const record = await ctx.runQuery(internal.adminEmails.get, { emailId: args.emailId });
    if (!record || record.status !== "sending") return;
    const recipients = (record.recipients ?? []) as EmailRecipient[];
    const cursor = record.recipientCursor ?? 0;
    const slice = recipients.slice(cursor, cursor + BATCH_SIZE);
    const appUrl = process.env.SITE_URL?.trim() || "https://usepassenger.com";
    const siteUrl = process.env.CONVEX_SITE_URL?.trim() || "";
    const tokens = (await ctx.runMutation(internal.adminEmails.ensureTokens, { emails: slice.map(recipient => recipient.email) })) as { email: string; token: string }[];
    const tokenByEmail = new Map((tokens ?? []).map(token => [token.email.toLowerCase(), token.token]));

    let sent = 0;
    let failed = 0;
    let lastError: string | undefined;
    for (const recipient of slice) {
      try {
        const token = tokenByEmail.get(recipient.email.toLowerCase());
        const unsubscribeUrl = token && siteUrl ? `${siteUrl}/unsubscribe?token=${encodeURIComponent(token)}` : undefined;
        const message = renderEmailDocument({
          subject: record.subject,
          blocks: record.blocks as EmailBlock[],
          design: record.design as EmailDesign | undefined,
          footer: record.footer as EmailFooter | undefined,
          unsubscribeUrl,
          appUrl,
        });
        const text = unsubscribeUrl ? `${message.text}\n\nTo stop receiving messages like this: ${unsubscribeUrl}` : message.text;
        await sendBrandedEmail({ to: recipient.email, subject: record.subject, html: message.html, text });
        sent += 1;
      } catch (error) {
        failed += 1;
        lastError = error instanceof Error ? error.message : "Unknown delivery error.";
      }
    }

    const nextCursor = cursor + slice.length;
    const done = nextCursor >= recipients.length;
    await ctx.runMutation(internal.adminEmails.recordProgress, { emailId: args.emailId, sent, failed, nextCursor, done, lastError });
    if (!done) await ctx.scheduler.runAfter(0, internal.adminEmails.dispatch, { emailId: args.emailId });
  },
});

// Cron entry point: promotes scheduled emails whose time has arrived and hands
// them to the dispatch action.
export const processDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db.query("adminEmails").withIndex("by_status", q => q.eq("status", "scheduled")).collect();
    let promoted = 0;
    for (const record of due) {
      if (record.scheduledFor === undefined || record.scheduledFor > now) continue;
      const recipients = await resolveRecipients(ctx, record.audience, record.listId);
      await ctx.db.patch(record._id, {
        status: recipients.length ? "sending" : "failed",
        scheduledFor: undefined,
        recipients,
        recipientCursor: 0,
        recipientCount: recipients.length,
        sentCount: 0,
        failedCount: 0,
        lastError: recipients.length ? undefined : "No recipients with an email address for this audience.",
        updatedAt: now,
      });
      if (recipients.length) await ctx.scheduler.runAfter(0, internal.adminEmails.dispatch, { emailId: record._id });
      promoted += 1;
    }
    return { promoted };
  },
});