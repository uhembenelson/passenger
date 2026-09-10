import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/paystack/webhook", method: "POST", handler: httpAction(async (ctx, request) => {
  if (Number(request.headers.get("content-length") ?? 0) > 262144) return new Response("Payload too large", { status: 413 });
  const body = await request.text(); if (body.length > 262144) return new Response("Payload too large", { status: 413 });
  const { status } = await ctx.runAction(internal.payments.receiveWebhook, { body, signature: request.headers.get("x-paystack-signature") ?? "" });
  return new Response(status === 200 ? "OK" : "Callback not accepted", { status });
}) });
export default http;
