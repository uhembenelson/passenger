import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { renderNotificationEmail, sendBrandedEmail } from "./emails";

export const context = internalQuery({
  args: { userId: v.id("users"), shipmentId: v.optional(v.id("shipments")) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.email) return null;
    const shipment = args.shipmentId ? await ctx.db.get(args.shipmentId) : null;
    return { email: user.email, name: user.name, reference: shipment?.reference };
  },
});

export const send = internalAction({
  args: { userId: v.id("users"), title: v.string(), body: v.string(), shipmentId: v.optional(v.id("shipments")) },
  handler: async (ctx, args): Promise<void> => {
    if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) return;
    const recipient = await ctx.runQuery(internal.notificationEmails.context, { userId: args.userId, shipmentId: args.shipmentId });
    if (!recipient) return;
    const appUrl = process.env.SITE_URL?.trim() || "https://usepassenger.com";
    const { html, text } = renderNotificationEmail({ name: recipient.name, title: args.title, body: args.body, appUrl, reference: recipient.reference });
    try {
      await sendBrandedEmail({ to: recipient.email, subject: args.title, html, text });
    } catch (error) {
      console.error("Transactional email delivery failed", args.title, error instanceof Error ? error.message : "Unknown error");
    }
  },
});
