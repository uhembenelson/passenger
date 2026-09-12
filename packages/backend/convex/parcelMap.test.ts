/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function fixture() {
  const t = convexTest(schema, modules);
  const sender = t.withIdentity({ subject: "map-sender" });
  const outsider = t.withIdentity({ subject: "map-outsider" });
  const owner = await sender.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000041" });
  await outsider.mutation(api.accounts.ensureProfile, { name: "Outsider", phone: "+2348000000042" });
  const shipmentId = await t.run(ctx => ctx.db.insert("shipments", {
    reference: "MAP-TEST", senderId: owner.id as Id<"users">, origin: "Jos", destination: "Abuja",
    description: "Test parcel", category: "Clothing", weightKg: 1, valueNaira: 1000, feeNaira: 500,
    receiverName: "Receiver", receiverPhone: "+2348000000043", status: "in_transit", paymentStatus: "held",
    createdAt: 1, updatedAt: 1, approved: true, reservationActive: false,
  }));
  return { t, sender, outsider, shipmentId };
}
test("rejects anonymous and unrelated users before provider calls", async () => {
  const { t, outsider, shipmentId } = await fixture();
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(t.action(api.deliveries.parcelMap, { shipmentId })).rejects.toThrow("Sign in required");
  await expect(outsider.action(api.deliveries.parcelMap, { shipmentId })).rejects.toThrow("participant access");
  expect(fetch).not.toHaveBeenCalled();
});
test("returns image data without exposing Convex's provider token", async () => {
  const { sender, shipmentId } = await fixture();
  vi.stubEnv("MAPBOX_ACCESS_TOKEN", "backend-only-token");
  const fetch = vi.fn(async (url: string) => {
    expect(url).toContain("access_token=backend-only-token");
    if (url.includes("geocoding")) return Response.json({ features: [{ center: url.includes("Jos") ? [8.9, 9.9] : [7.5, 9.1] }] });
    if (url.includes("directions")) return Response.json({ routes: [] });
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  });
  vi.stubGlobal("fetch", fetch);
  const result = await sender.action(api.deliveries.parcelMap, { shipmentId });
  expect(result).toEqual({ imageUri: "data:image/png;base64,iVBORw==", roadRoute: false });
  expect(JSON.stringify(result)).not.toContain("backend-only-token");
  expect(fetch).toHaveBeenCalledTimes(4);
});
test("sanitizes provider errors and handles missing configuration", async () => {
  const { sender, shipmentId } = await fixture();
  vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(sender.action(api.deliveries.parcelMap, { shipmentId })).rejects.toThrow("Parcel maps are unavailable");
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("MAPBOX_ACCESS_TOKEN", "backend-only-token");
  fetch.mockRejectedValue(new Error("Failed URL access_token=backend-only-token"));
  await expect(sender.action(api.deliveries.parcelMap, { shipmentId })).rejects.toThrow("Couldn't load the parcel map. Please try again.");
});
