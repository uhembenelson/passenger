"use node";

import { randomInt } from "node:crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { codeKind } from "./schema";
import { v } from "convex/values";
import { fail, safeNormalizePhone } from "./lib";

async function sendSms(phone: string, message: string): Promise<{ sid: string }> {
  const apiKey = process.env.TERMII_API_KEY;
  const sender = process.env.TERMII_SENDER_ID;
  const channel = process.env.TERMII_CHANNEL || "generic";
  if (!apiKey || !sender) fail("SMS delivery is not configured. Set TERMII_API_KEY and TERMII_SENDER_ID on the backend deployment.");
  if (!["generic", "dnd"].includes(channel)) fail("TERMII_CHANNEL must be generic or dnd.");
  const baseUrl = process.env.TERMII_BASE_URL || "https://api.ng.termii.com";
  const endpoint = new URL(baseUrl);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) fail("TERMII_BASE_URL must be an HTTPS URL.");
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, to: safeNormalizePhone(phone).slice(1), from: sender, sms: message, type: "plain", channel }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail("We could not connect to the SMS service. Please try again.");
  }
  const result = await response.json().catch(() => null) as { code?: string; message_id?: string } | null;
  if (!response.ok || result?.code !== "ok" || typeof result.message_id !== "string" || !result.message_id) {
    fail("Passenger could not send the SMS. Check the Termii configuration and balance, then try again.");
  }
  return { sid: result.message_id };
}

export const generatePhoneCode = internalAction({
  args: {},
  returns: v.string(),
  handler: async () => randomInt(0, 1_000_000).toString().padStart(6, "0"),
});

export const sendPhoneVerificationCode = internalAction({
  args: { receiverPhone: v.string(), code: v.string() },
  returns: v.object({ sid: v.string() }),
  handler: async (_ctx, args) => sendSms(args.receiverPhone,
    `Passenger verification code: ${args.code}. Enter it in the app within 10 minutes to verify your phone number.`),
});

export const sendDeliveryCode = internalAction({
  args: { receiverPhone: v.string(), code: v.string(), shipmentReference: v.string() },
  returns: v.object({ sid: v.string() }),
  handler: async (_ctx, args) => sendSms(args.receiverPhone,
    `Passenger delivery code for ${args.shipmentReference}: ${args.code}. Share it only with the assigned traveller after you inspect and receive the parcel. It expires in 10 minutes.`),
});

// A status message contains no private delivery code. SMS failures do not undo physical handover.
export const sendParcelMilestone = internalAction({
  args: { shipmentId: v.id("shipments"), kind: codeKind, receiverPhone: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    let status: "sent" | "failed" = "failed";
    try {
      const body = args.kind === "handover"
        ? `Passenger: parcel ${args.reference} has been collected and is on its way to you. The sender will share a private delivery code. Give it to the traveller only after you inspect and receive the parcel.`
        : `Passenger: parcel ${args.reference} was confirmed delivered using your receiver code. If something is wrong, contact the sender to report it in Passenger.`;
      await sendSms(args.receiverPhone, body);
      status = "sent";
    } catch { /* The saved failure is visible to delivery participants. */ }
    await ctx.runMutation(internal.deliveryState.markReceiverMilestoneSms, { shipmentId: args.shipmentId, kind: args.kind, status });
  },
});
