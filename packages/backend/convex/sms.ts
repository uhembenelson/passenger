"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { fail } from "./lib";

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
    const receiverPhone = args.receiverPhone.trim();
    if (!receiverPhone) fail("Receiver phone number is missing.");

    const body = `Passenger verification code: ${args.code}. Enter it in the app within 10 minutes to verify your phone number.`;
    const payload = new URLSearchParams({
      To: receiverPhone,
      Body: body,
      ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : { From: fromNumber! }),
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });

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
    const receiverPhone = args.receiverPhone.trim();
    if (!receiverPhone) fail("Receiver phone number is missing.");

    const body = `Passenger delivery code for ${args.shipmentReference}: ${args.code}. Share it only with the assigned traveller after you inspect and receive the parcel. It expires in 10 minutes.`;
    const payload = new URLSearchParams({
      To: receiverPhone,
      Body: body,
      ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : { From: fromNumber! }),
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });

    const result = await response.json().catch(() => null) as { sid?: string; status?: string; message?: string } | null;
    if (!response.ok || !result?.sid || (result.status && ["failed", "undelivered"].includes(result.status))) {
      fail(result?.message || "Passenger could not send the receiver code SMS. Check the Twilio configuration and try again.");
    }

    return { sid: result.sid };
  },
});
