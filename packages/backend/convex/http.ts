import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);

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
export default http;
