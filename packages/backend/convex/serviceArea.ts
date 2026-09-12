import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { audit, fail, requireAdmin } from "./lib";

export const DEFAULT_SERVICE_AREA = {
  baseLocation: "Jos",
  destinations: ["Abuja", "Kaduna", "Lagos"],
};

export async function getServiceArea(ctx: QueryCtx | MutationCtx) {
  const row = await ctx.db.query("serviceAreaSettings").withIndex("by_key", q => q.eq("key", "primary")).first();
  return row ? { baseLocation: row.baseLocation, destinations: row.destinations } : DEFAULT_SERVICE_AREA;
}

export async function assertSupportedRoute(ctx: QueryCtx | MutationCtx, origin: string, destination: string) {
  const config = await getServiceArea(ctx);
  const from = origin.trim().toLowerCase();
  const to = destination.trim().toLowerCase();
  const base = config.baseLocation.trim().toLowerCase();
  const destinations = new Set(config.destinations.map(value => value.trim().toLowerCase()));
  if (!((from === base && destinations.has(to)) || (to === base && destinations.has(from)))) {
    fail(`This route is outside the current ${config.baseLocation} service area.`);
  }
}

export const get = query({ args: {}, handler: getServiceArea });

export const update = mutation({
  args: { baseLocation: v.string(), destinations: v.array(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const baseLocation = args.baseLocation.trim();
    const rawDestinations = args.destinations.map(value => value.trim()).filter(Boolean);
    if (!baseLocation || baseLocation.length > 80) fail("Enter a valid base location.");
    const seen = new Set<string>();
    const destinations: string[] = [];
    for (const value of rawDestinations) {
      if (value.toLowerCase() === baseLocation.toLowerCase()) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (value.length > 80) fail("Destinations must be shorter than 80 characters.");
      if (destinations.length >= 20) break;
      destinations.push(value);
    }
    if (!destinations.length) fail("Configure at least one destination.");
    const existing = await ctx.db.query("serviceAreaSettings").withIndex("by_key", q => q.eq("key", "primary")).first();
    const value = { key: "primary", baseLocation, destinations, updatedAt: Date.now(), updatedBy: admin._id };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("serviceAreaSettings", value);
    await audit(ctx, admin, "service_area.updated", `Service area updated to ${baseLocation}: ${destinations.join(", ")}.`);
    return { baseLocation, destinations };
  },
});
