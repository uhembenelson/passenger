"use node";
import { createHash, randomInt } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { codeKind } from "./schema";
const digest = (shipmentId: string, kind: string, code: string) => createHash("sha256").update(`${shipmentId}:${kind}:${code}`).digest("hex");
export const generate = internalAction({ args: { shipmentId: v.id("shipments"), kind: codeKind }, handler: async (_ctx, args): Promise<{ code: string; hash: string }> => { const code = randomInt(0, 100000000).toString().padStart(8, "0"); return { code, hash: digest(args.shipmentId, args.kind, code) }; } });
export const hash = internalAction({ args: { shipmentId: v.id("shipments"), kind: codeKind, code: v.string() }, handler: async (_ctx, args): Promise<string> => digest(args.shipmentId, args.kind, args.code) });
