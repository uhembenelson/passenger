import { v } from "convex/values";
import { PERMISSIONS, type EmailBlock, type EmailDesign, type EmailFooter } from "@passenger/core";
import { mutation, query } from "./_generated/server";
import { emailBlock, emailDesign, emailFooter } from "./schema";
import { audit, fail, requireAdmin, requirePermission, requireUser } from "./lib";
import { normalizeDesign, normalizeFooter, validateBlocks, validateFooter } from "./adminEmails";

const MAX_NAME_LENGTH = 80;

interface TemplateInput {
  name: string;
  subject: string;
  blocks: EmailBlock[];
  design?: EmailDesign;
  footer?: EmailFooter;
}

function validateInput(args: TemplateInput) {
  const name = args.name.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) fail(`Give the template a name up to ${MAX_NAME_LENGTH} characters.`);
  if (args.subject.trim().length > 140) fail("Keep the default subject under 140 characters.");
  validateBlocks(args.blocks);
  validateFooter(args.footer);
}

// Templates are shared across the team: any admin with the manage permission
// can list, use, edit or delete any template.
export const list = query({
  args: {},
  handler: async ctx => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    const templates = await ctx.db.query("emailTemplates").withIndex("by_created").order("desc").collect();
    return templates.map(template => ({
      id: template._id,
      name: template.name,
      subject: template.subject,
      blocks: template.blocks,
      design: template.design,
      footer: template.footer,
      createdByName: template.createdByName,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    blocks: v.array(emailBlock),
    design: v.optional(emailDesign),
    footer: v.optional(emailFooter),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    validateInput(args);
    const now = Date.now();
    const templateId = await ctx.db.insert("emailTemplates", {
      name: args.name.trim(),
      subject: args.subject.trim(),
      blocks: args.blocks,
      design: normalizeDesign(args.design),
      footer: normalizeFooter(args.footer),
      createdBy: viewer._id,
      createdByName: viewer.name,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, viewer, "admin_email_template.created", `Created email template "${args.name.trim()}".`);
    return templateId;
  },
});

export const update = mutation({
  args: {
    id: v.id("emailTemplates"),
    name: v.string(),
    subject: v.string(),
    blocks: v.array(emailBlock),
    design: v.optional(emailDesign),
    footer: v.optional(emailFooter),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const template = await ctx.db.get(args.id);
    if (!template) fail("Template not found.");
    validateInput(args);
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      subject: args.subject.trim(),
      blocks: args.blocks,
      design: normalizeDesign(args.design),
      footer: normalizeFooter(args.footer),
      updatedAt: Date.now(),
    });
    await audit(ctx, viewer, "admin_email_template.updated", `Updated email template "${args.name.trim()}".`);
  },
});

export const remove = mutation({
  args: { id: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const template = await ctx.db.get(args.id);
    if (!template) fail("Template not found.");
    await ctx.db.delete(args.id);
    await audit(ctx, viewer, "admin_email_template.deleted", `Deleted email template "${template.name}".`);
  },
});