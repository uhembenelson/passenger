import type { MobileProductConfig } from "@passenger/core";
import type { QueryCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";

export const MIN_TOP_UP_NAIRA = 100;
export const MAX_TOP_UP_NAIRA = 500000;
export const MOBILE_PRODUCT_CONFIG_KEY = "mobile_product_config";

export const defaultMobileProductConfig: MobileProductConfig = {
  parcelTypes: [
    { label: "Small Envelope", weightKg: 0.5, category: "Documents" },
    { label: "Medium Parcel", weightKg: 5, category: "Other" },
    { label: "Large Parcel", weightKg: 15, category: "Other" },
  ],
  wallet: { topUpPresetsNaira: [2000, 5000, 10000, 20000, 50000], withdrawalPresetsNaira: [2000, 5000, 10000], minTopUpNaira: MIN_TOP_UP_NAIRA, maxTopUpNaira: MAX_TOP_UP_NAIRA, defaultTopUpNaira: 5000 },
  banks: [
    { code: "044", name: "Access Bank" }, { code: "058", name: "GTBank" }, { code: "057", name: "Zenith Bank" },
    { code: "011", name: "First Bank" }, { code: "033", name: "UBA" }, { code: "50211", name: "Kuda Bank" },
    { code: "999992", name: "OPay" }, { code: "999991", name: "PalmPay" }, { code: "221", name: "Stanbic IBTC" },
    { code: "232", name: "Sterling Bank" }, { code: "070", name: "Fidelity Bank" }, { code: "035", name: "Wema Bank" }, { code: "214", name: "FCMB" },
  ],
  residence: { states: ["Plateau", "Federal Capital Territory", "Lagos", "Kaduna", "Kano", "Oyo", "Enugu", "Rivers"], localGovernmentAreas: ["Jos North", "Jos South", "Jos East", "Bassa", "Barkin Ladi", "Riyom", "Mangu"], defaultState: "Plateau", defaultLocalGovernmentArea: "Jos North" },
};

export async function getMobileProductConfig(ctx: QueryCtx): Promise<MobileProductConfig> {
  const stored = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", MOBILE_PRODUCT_CONFIG_KEY)).first();
  if (!stored) return defaultMobileProductConfig;
  try { return JSON.parse(stored.body) as MobileProductConfig; }
  catch { return defaultMobileProductConfig; }
}

export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => getMobileProductConfig(ctx),
});
