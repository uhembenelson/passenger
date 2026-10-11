import { v } from "convex/values";
import { EMAIL_AUDIENCES, PERMISSIONS } from "@passenger/core";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { audit, fail, requireAdmin, requirePermission, requireUser } from "./lib";
import { resolveAudienceUsers, type EmailRecipient } from "./adminEmails";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_MEMBERS_RETURNED = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ListMemberInput {
  email: string;
  name?: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return email.length <= 320 && EMAIL_RE.test(email);
}

function validateInput(args: { name: string; description?: string }) {
  const name = args.name.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) fail(`Give the list a name up to ${MAX_NAME_LENGTH} characters.`);
  if ((args.description ?? "").length > MAX_DESCRIPTION_LENGTH) fail(`Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`);
}

async function usersByEmail(ctx: QueryCtx | MutationCtx): Promise<Map<string, Id<"users">>> {
  const users = await ctx.db.query("users").collect();
  const map = new Map<string, Id<"users">>();
  for (const user of users) {
    if (typeof user.email === "string" && user.email.trim()) map.set(user.email.trim().toLowerCase(), user._id);
  }
  return map;
}

// Insert members with deduplication against the list's current members. Emails
// are validated up front so an invalid address rejects the whole batch with a
// readable message; each added member is linked to a matching Passenger
// account when one exists.
async function addMembersToList(ctx: MutationCtx, listId: Id<"emailLists">, inputs: ListMemberInput[]) {
  const list = await ctx.db.get(listId);
  if (!list) fail("Email list not found.");
  const existing = new Set<string>((await ctx.db.query("emailListMembers").withIndex("by_list", q => q.eq("listId", listId)).collect()).map(member => member.email));
  const users = await usersByEmail(ctx);

  const invalid: string[] = [];
  const seen = new Set<string>();
  const toAdd: { email: string; name?: string; userId?: Id<"users"> }[] = [];
  for (const input of inputs) {
    const email = normalizeEmail(input.email);
    if (seen.has(email) || existing.has(email)) continue;
    seen.add(email);
    if (!isValidEmail(email)) {
      invalid.push(email || "(blank)");
      continue;
    }
    toAdd.push({ email, name: input.name?.trim() || undefined, userId: users.get(email) });
  }
  if (invalid.length > 0) {
    const preview = invalid.slice(0, 3).join(", ");
    fail(`${invalid.length === 1 ? "This address is not valid" : "Some addresses are not valid"}: ${preview}${invalid.length > 3 ? "…" : ""}.`);
  }

  const now = Date.now();
  for (const member of toAdd) {
    await ctx.db.insert("emailListMembers", { listId, email: member.email, name: member.name, userId: member.userId, addedAt: now });
  }
  if (toAdd.length) {
    await ctx.db.patch(listId, { memberCount: list.memberCount + toAdd.length, updatedAt: now });
  }
  return { added: toAdd.length, skipped: inputs.length - toAdd.length };
}

export const list = query({
  args: {},
  handler: async ctx => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    const emailLists = await ctx.db.query("emailLists").withIndex("by_created").order("desc").collect();
    return emailLists.map(emailList => ({
      id: emailList._id,
      name: emailList.name,
      description: emailList.description,
      memberCount: emailList.memberCount,
      createdByName: emailList.createdByName,
      createdAt: emailList.createdAt,
      updatedAt: emailList.updatedAt,
    }));
  },
});

export const get = query({
  args: { id: v.id("emailLists") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    const emailList = await ctx.db.get(args.id);
    if (!emailList) fail("Email list not found.");
    const members = await ctx.db.query("emailListMembers").withIndex("by_list", q => q.eq("listId", args.id)).collect();
    members.sort((a, b) => b.addedAt - a.addedAt);
    const slice = members.slice(0, MAX_MEMBERS_RETURNED);
    return {
      id: emailList._id,
      name: emailList.name,
      description: emailList.description,
      memberCount: emailList.memberCount,
      createdByName: emailList.createdByName,
      createdAt: emailList.createdAt,
      updatedAt: emailList.updatedAt,
      members: slice.map(member => ({
        id: member._id,
        email: member.email,
        name: member.name,
        isUser: member.userId !== undefined,
        addedAt: member.addedAt,
      })),
      truncated: members.length > MAX_MEMBERS_RETURNED,
    };
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    validateInput(args);
    const now = Date.now();
    const listId = await ctx.db.insert("emailLists", {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      memberCount: 0,
      createdBy: viewer._id,
      createdByName: viewer.name,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, viewer, "admin_email_list.created", `Created email list "${args.name.trim()}".`);
    return listId;
  },
});

export const update = mutation({
  args: { id: v.id("emailLists"), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const emailList = await ctx.db.get(args.id);
    if (!emailList) fail("Email list not found.");
    validateInput(args);
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, viewer, "admin_email_list.updated", `Updated email list "${args.name.trim()}".`);
  },
});

export const remove = mutation({
  args: { id: v.id("emailLists") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const emailList = await ctx.db.get(args.id);
    if (!emailList) fail("Email list not found.");
    const emails = await ctx.db.query("adminEmails").withIndex("by_created").collect();
    if (emails.some(email => email.listId === args.id && email.status !== "draft")) fail("This list is used by an email that has been sent or scheduled. Choose a different audience before deleting it.");
    const members = await ctx.db.query("emailListMembers").withIndex("by_list", q => q.eq("listId", args.id)).collect();
    for (const member of members) await ctx.db.delete(member._id);
    await ctx.db.delete(args.id);
    await audit(ctx, viewer, "admin_email_list.deleted", `Deleted email list "${emailList.name}" with ${members.length} member${members.length === 1 ? "" : "s"}.`);
  },
});

// Add one or more addresses from a form, a paste, or an import. This is the
// single entry point for every member-add path.
export const addMembers = mutation({
  args: { listId: v.id("emailLists"), members: v.array(v.object({ email: v.string(), name: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    if (args.members.length === 0) fail("Add at least one email address.");
    if (args.members.length > 500) fail("Add up to 500 addresses at a time.");
    const emailList = await ctx.db.get(args.listId);
    if (!emailList) fail("Email list not found.");
    const result = await addMembersToList(ctx, args.listId, args.members);
    await audit(ctx, viewer, "admin_email_list.members_added", `Added ${result.added} member${result.added === 1 ? "" : "s"} to list "${emailList.name}".`);
    return result;
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("emailListMembers") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const member = await ctx.db.get(args.memberId);
    if (!member) fail("Member not found.");
    const emailList = await ctx.db.get(member.listId);
    if (!emailList) fail("Email list not found.");
    await ctx.db.delete(args.memberId);
    await ctx.db.patch(member.listId, { memberCount: Math.max(0, emailList.memberCount - 1), updatedAt: Date.now() });
    await audit(ctx, viewer, "admin_email_list.member_removed", `Removed ${member.email} from list "${emailList.name}".`);
  },
});

// Seed a list from one of the built-in audiences (all users, a tier, drivers,
// senders). Only accounts with an email address are added.
export const importAudience = mutation({
  args: { listId: v.id("emailLists"), audience: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    if (!(EMAIL_AUDIENCES as readonly string[]).includes(args.audience)) fail("Choose a valid audience to import.");
    const emailList = await ctx.db.get(args.listId);
    if (!emailList) fail("Email list not found.");
    const recipients: EmailRecipient[] = await resolveAudienceUsers(ctx, args.audience);
    const result = await addMembersToList(ctx, args.listId, recipients.map(recipient => ({ email: recipient.email, name: recipient.name })));
    await audit(ctx, viewer, "admin_email_list.imported", `Imported ${result.added} member${result.added === 1 ? "" : "s"} from ${args.audience} into "${emailList.name}".`);
    return result;
  },
});