import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { renderWaitlistEmail, sendBrandedEmail } from "./emails";

const NIGERIAN_STATES = new Set([
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo",
  "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const join = action({
  args: { name: v.string(), email: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<{ joined: true; confirmationSent: boolean }> => {
    const name = args.name.trim().replace(/\s+/g, " ");
    const email = args.email.trim().toLowerCase();
    const state = args.state.trim();
    if (name.length < 2 || name.length > 120) throw new ConvexError("Enter your name.");
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new ConvexError("Enter a valid email address.");
    if (!NIGERIAN_STATES.has(state)) throw new ConvexError("Choose a valid state.");

    const reservation = await ctx.runMutation(internal.waitlistState.reserve, { name, email, state });
    if (!reservation.shouldSend) return { joined: true, confirmationSent: true };

    const siteUrl = process.env.SITE_URL?.trim() || "https://usepassenger.com";
    const message = renderWaitlistEmail({ name, state, siteUrl });
    try {
      const sent = await sendBrandedEmail({
        to: email,
        subject: "You are on the Passenger waitlist",
        ...message,
      });
      await ctx.runMutation(internal.waitlistState.recordConfirmation, { signupId: reservation.signupId, status: "sent", emailId: sent.id });
      return { joined: true, confirmationSent: true };
    } catch (error) {
      await ctx.runMutation(internal.waitlistState.recordConfirmation, { signupId: reservation.signupId, status: "failed" });
      throw error;
    }
  },
});
