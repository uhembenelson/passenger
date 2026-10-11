import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unsubscribePage(message: string, status: number) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribe from Passenger</title>
</head>
<body style="margin:0; background:#F7F7F8; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; color:#2D362F;">
  <div style="max-width:480px; margin:0 auto; padding:64px 24px;">
    <div style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:12px; padding:40px 32px; text-align:center;">
      <span style="display:inline-block; font-size:12px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:#248A56;">Passenger</span>
      <h1 style="margin:16px 0 12px 0; font-size:22px; font-weight:600; letter-spacing:-0.01em;">You are unsubscribed</h1>
      <p style="margin:0; font-size:15px; line-height:1.7; color:#4B5563;">${escapeHtml(message)}</p>
    </div>
    <p style="margin:24px 0 0 0; text-align:center; font-size:12px; color:#9CA3AF;">Good things move with people.</p>
  </div>
</body>
</html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

http.route({ path: "/unsubscribe", method: "GET", handler: httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return unsubscribePage("This link is missing its details. Open the email again and try the unsubscribe link there.", 400);
  try {
    const result = await ctx.runMutation(internal.emailContacts.unsubscribeByToken, { token });
    if (!result.ok) return unsubscribePage("This unsubscribe link is not recognised. It may already have been used.", 404);
    const message = result.already
      ? "This address was already unsubscribed from Passenger broadcast emails, so nothing has changed."
      : `You will no longer receive broadcast emails from Passenger${result.email ? ` (${result.email})` : ""}. You can subscribe again from the Passenger app at any time.`;
    return unsubscribePage(message, 200);
  } catch (error) {
    console.error("Unsubscribe processing error:", error);
    return unsubscribePage("Something went wrong processing this request. Please try again.", 500);
  }
}) });

http.route({ path: "/delivery-options", method: "GET", handler: httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const shipmentId = url.searchParams.get("shipmentId");
    if (!shipmentId) return new Response("Missing shipmentId", { status: 400 });
    const result = await ctx.runAction(api.deliveryProviders.getProviderOptions, { shipmentId: shipmentId as any });
    return Response.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load delivery options.";
    const status = /Missing shipmentId|Shipment not found|participant access|Sign in required/.test(message) ? 400 : 500;
    return new Response(message, { status });
  }
}) });

http.route({ path: "/paystack/webhook", method: "POST", handler: httpAction(async (ctx, request) => {
  if (Number(request.headers.get("content-length") ?? 0) > 262144) return new Response("Payload too large", { status: 413 });
  const body = await request.text(); if (body.length > 262144) return new Response("Payload too large", { status: 413 });
  try {
    const { status } = await ctx.runAction(internal.payments.receiveWebhook, { body, signature: request.headers.get("x-paystack-signature") ?? "" });
    return new Response(status === 200 ? "OK" : "Callback not accepted", { status });
  } catch (error) {
    console.error("Paystack webhook processing error:", error);
    return new Response("Webhook processing error", { status: 500 });
  }
}) });

http.route({ path: "/v4/wallet/webhook", method: "POST", handler: httpAction(async (ctx, request) => {
  const expected = process.env.V4_WALLET_WEBHOOK_SECRET;
  const url = new URL(request.url);
  const supplied = request.headers.get("x-v4-webhook-secret") ?? url.searchParams.get("v4_webhook_token");
  if (!expected || !supplied || supplied !== expected) return new Response("Unauthorized", { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 262144) return new Response("Payload too large", { status: 413 });
  const body = await request.text(); if (body.length > 262144) return new Response("Payload too large", { status: 413 });
  try {
    const result = await ctx.runAction(internal.wallet.receiveV4Webhook, { body });
    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("V4 wallet webhook processing error:", error);
    return new Response("Webhook processing error", { status: 400 });
  }
}) });
export default http;
