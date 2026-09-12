/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as cancellationPolicies from "../cancellationPolicies.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as deliveries from "../deliveries.js";
import type * as deliveryCrypto from "../deliveryCrypto.js";
import type * as deliveryState from "../deliveryState.js";
import type * as emails from "../emails.js";
import type * as escrowPolicies from "../escrowPolicies.js";
import type * as evidence from "../evidence.js";
import type * as faqs from "../faqs.js";
import type * as finance from "../finance.js";
import type * as financeSchema from "../financeSchema.js";
import type * as financeState from "../financeState.js";
import type * as http from "../http.js";
import type * as journeys from "../journeys.js";
import type * as kycTiers from "../kycTiers.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as marketplace from "../marketplace.js";
import type * as marketplaceProfiles from "../marketplaceProfiles.js";
import type * as notifications from "../notifications.js";
import type * as offers from "../offers.js";
import type * as parcelMapData from "../parcelMapData.js";
import type * as paymentState from "../paymentState.js";
import type * as payments from "../payments.js";
import type * as productConfig from "../productConfig.js";
import type * as promotions from "../promotions.js";
import type * as reviews from "../reviews.js";
import type * as security from "../security.js";
import type * as seed from "../seed.js";
import type * as serviceArea from "../serviceArea.js";
import type * as settings from "../settings.js";
import type * as shipments from "../shipments.js";
import type * as sms from "../sms.js";
import type * as support from "../support.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  admin: typeof admin;
  auth: typeof auth;
  cancellationPolicies: typeof cancellationPolicies;
  conversations: typeof conversations;
  crons: typeof crons;
  deliveries: typeof deliveries;
  deliveryCrypto: typeof deliveryCrypto;
  deliveryState: typeof deliveryState;
  emails: typeof emails;
  escrowPolicies: typeof escrowPolicies;
  evidence: typeof evidence;
  faqs: typeof faqs;
  finance: typeof finance;
  financeSchema: typeof financeSchema;
  financeState: typeof financeState;
  http: typeof http;
  journeys: typeof journeys;
  kycTiers: typeof kycTiers;
  lib: typeof lib;
  maintenance: typeof maintenance;
  marketplace: typeof marketplace;
  marketplaceProfiles: typeof marketplaceProfiles;
  notifications: typeof notifications;
  offers: typeof offers;
  parcelMapData: typeof parcelMapData;
  paymentState: typeof paymentState;
  payments: typeof payments;
  productConfig: typeof productConfig;
  promotions: typeof promotions;
  reviews: typeof reviews;
  security: typeof security;
  seed: typeof seed;
  serviceArea: typeof serviceArea;
  settings: typeof settings;
  shipments: typeof shipments;
  sms: typeof sms;
  support: typeof support;
  wallet: typeof wallet;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
