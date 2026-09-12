"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { codeKind } from "./schema";
import { v } from "convex/values";
import { fail, safeNormalizePhone } from "./lib";

function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    fail("Receiver SMS delivery is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
  }

  return { accountSid, authToken, fromNumber, messagingServiceSid };
}

export const sendPhoneVerificationCode = internalAction({
  args: {
    receiverPhone: v.string(),
    code: v.string(),
  },
  handler: async (_ctx, args): Promise<{ sid: string }> => {
    const { accountSid, authToken, fromNumber, messagingServiceSid } = credentials();
    const receiverPhone = safeNormalizePhone(args.receiverPhone);

    const body = `Passenger verification code: ${args.code}. Enter it in the app within 10 minutes to verify your phone number.`;
    const payload = new URLSearchParams({
      To: receiverPhone,
      Body: body,
      ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : { From: fromNumber! }),
    });

    let response: Response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail("We could not connect to the SMS service. Please check your connection and try again.");
    }

    const result = await response.json().catch(() => null) as { sid?: string; status?: string; message?: string } | null;
    if (!response.ok || !result?.sid || (result.status && ["failed", "undelivered"].includes(result.status))) {
      fail(result?.message || "Passenger could not send the phone verification SMS. Check the Twilio configuration and try again.");
    }

    return { sid: result.sid };
  },
});

export const sendDeliveryCode = internalAction({
  args: {
    receiverPhone: v.string(),
    code: v.string(),
    shipmentReference: v.string(),
  },
  handler: async (_ctx, args): Promise<{ sid: string }> => {
    const { accountSid, authToken, fromNumber, messagingServiceSid } = credentials();
    const receiverPhone = safeNormalizePhone(args.receiverPhone);

    const body = `Passenger delivery code for ${args.shipmentReference}: ${args.code}. Share it only with the assigned traveller after you inspect and receive the parcel. It expires in 10 minutes.`;
    const payload = new URLSearchParams({
      To: receiverPhone,
      Body: body,
      ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : { From: fromNumber! }),
    });

    let response: Response;
    try {
      response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail("We could not connect to the SMS service. Please check your connection and try again.");
    }

    const result = await response.json().catch(() => null) as { sid?: string; status?: string; message?: string } | null;
    if (!response.ok || !result?.sid || (result.status && ["failed", "undelivered"].includes(result.status))) {
      fail(result?.message || "Passenger could not send the receiver code SMS. Check the Twilio configuration and try again.");
    }

    return { sid: result.sid };
  },
});

// A status message contains no private delivery code. SMS failures do not undo physical handover.
export const sendParcelMilestone = internalAction({
  args: { shipmentId: v.id("shipments"), kind: codeKind, receiverPhone: v.string(), reference: v.string() },
  handler: async (ctx, args) => {
    let status: "sent" | "failed" = "failed";
    try {
      const receiverPhone = safeNormalizePhone(args.receiverPhone);
      const { accountSid, authToken, fromNumber, messagingServiceSid } = credentials();
      const body = args.kind === "handover"
        ? `Passenger: parcel ${args.reference} has been collected and is on its way to you. The sender will share a private delivery code. Give it to the traveller only after you inspect and receive the parcel.`
        : `Passenger: parcel ${args.reference} was confirmed delivered using your receiver code. If something is wrong, contact the sender to report it in Passenger.`;
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: receiverPhone, Body: body, ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : { From: fromNumber! }) }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => null) as { sid?: string; status?: string } | null;
      if (response.ok && result?.sid && !["failed", "undelivered"].includes(result.status ?? "")) status = "sent";
    } catch { /* The saved failure is visible to delivery participants. */ }
    await ctx.runMutation(internal.deliveryState.markReceiverMilestoneSms, { shipmentId: args.shipmentId, kind: args.kind, status });
  },
});
