import React, { createContext, useContext, useEffect, useMemo } from "react";
import { Linking } from "react-native";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import * as FileSystem from "expo-file-system/legacy";
import { File as ExpoFile } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { useNetworkState } from "expo-network";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { isPlaceholderPhone, isValidPhone, normalizePhone, validateShipment, validateTrip } from "@passenger/core";
import type { CreateShipmentInput, CreateTripInput, DashboardSnapshot, DocumentType, IdentityNumberType } from "@passenger/core";
import { openAuthSignInScreen } from "./auth";

export interface PassengerData {
  snapshot: DashboardSnapshot | undefined;
  authLoading: boolean;
  offline: boolean;
  authError?: string;
  createShipment: (input: CreateShipmentInput) => Promise<void>;
  updateShipment: (shipmentId: string, input: CreateShipmentInput) => Promise<void>;
  createTrip: (input: CreateTripInput, clientRequestId?: string) => Promise<void>;
  updateTrip: (tripId: string, input: CreateTripInput) => Promise<void>;
  matchShipment: (shipmentId: string, tripId: string, input: { expiresAt: number; note: string }) => Promise<void>;
  acceptOffer: (offerId: string) => Promise<void>;
  declineOffer: (offerId: string) => Promise<void>;
  withdrawOffer: (offerId: string) => Promise<void>;
  cancelShipment: (shipmentId: string) => Promise<void>;
  issueCode: (shipmentId: string, kind: "handover" | "delivery") => Promise<string | undefined>;
  prepareDeliveryShare: (shipmentId: string) => Promise<{ code: string; receiverPhone: string; reference: string }>;
  confirmHandover: (shipmentId: string, code: string, evidenceIds?: string[]) => Promise<void>;
  confirmDelivery: (shipmentId: string, code: string, evidenceIds?: string[]) => Promise<void>;
  raiseDispute: (shipmentId: string, reason: string) => Promise<void>;
  pay: (shipmentId: string) => Promise<void>;
  ensureProfile: (name: string, phone: string) => Promise<void>;
  bootstrapProfile: () => Promise<void>;
  normalizeUnverifiedPhone: () => Promise<void>;
  completeActivation: () => Promise<void>;
  saveActivationName: (name: string) => Promise<void>;
  requestPhoneVerification: (phone: string) => Promise<{ phone: string; resendAt: number; expiresAt: number; skipped?: boolean }>;
  confirmPhoneVerification: (code: string) => Promise<void>;
  initiateIdentityNumberVerification: (input: { type: IdentityNumberType; identityNumber: string }) => Promise<{ identityId: string; type: IdentityNumberType; message: string }>;
  verifyIdentityNumberOtp: (input: { type: IdentityNumberType; identityId: string; otp: string }) => Promise<{ type: IdentityNumberType; verifiedAt: number; fullName: string }>;
  updateParcelLocation: (shipmentId: string, input: { latitude: number; longitude: number; place: string }) => Promise<void>;
  updateContactDetails: (input: { email?: string; name?: string; image?: string }) => Promise<void>;
  updateProfileImage: (input: { uri: string; contentType?: string }) => Promise<void>;
  submitIdentity: (input: { name: string; phone: string; documentType: DocumentType; evidenceIds: string[] }) => Promise<void>;
  requestAccountDeletion: () => Promise<void>;
  topUpWallet: (amountNaira: number) => Promise<{ mode: "virtual_account"; reference: string; externalReference: string; accountNumber: string; accountName: string; amount: number; expiresAt: string }>;
  verifyWalletTopUp: (reference: string) => Promise<{ success: boolean; balanceNaira: number }>;
  upgradeToTier2: (bvn: string) => Promise<void>;
  upgradeToTier3: (input: { state: string; lga: string; address: string; streetPhotoUrl?: string; housePhotoUrl?: string }) => Promise<void>;
  signOut: () => Promise<void>;
}
const DataContext = createContext<PassengerData | null>(null);
type PassengerState = Pick<PassengerData, "snapshot" | "authLoading" | "offline" | "authError">;
type PassengerActions = Omit<PassengerData, keyof PassengerState>;
const StateContext = createContext<PassengerState | null>(null);
const ActionsContext = createContext<PassengerActions | null>(null);

export function usePassengerState() {
  const value = useContext(StateContext);
  if (!value) throw new Error("Passenger state provider is missing.");
  return value;
}

export function usePassengerActions() {
  const value = useContext(ActionsContext);
  if (!value) throw new Error("Passenger actions provider is missing.");
  return value;
}

export function usePassenger() {
  const value = useContext(DataContext);
  if (!value) throw new Error("Passenger data provider is missing.");
  return value;
}
export const shipmentId = (id: string) => id as Id<"shipments">;
export const tripId = (id: string) => id as Id<"trips">;
export const offerId = (id: string) => id as Id<"offers">;

async function withResponseDeadline<T>(request: Promise<T>, message: string, timeoutMs = 15_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function LiveDataProvider({ children }: React.PropsWithChildren) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const snapshot = useQuery(api.marketplace.dashboard, isAuthenticated ? { surface: "mobile" } : "skip") as DashboardSnapshot | undefined;
  const createShipment = useMutation(api.marketplace.createShipment);
  const updateShipment = useMutation(api.shipments.update);
  const createTrip = useMutation(api.marketplace.createTrip);
  const updateTrip = useMutation(api.journeys.update);
  const match = useMutation(api.marketplace.matchShipment);
  const acceptOffer = useMutation(api.offers.accept);
  const declineOffer = useMutation(api.offers.decline);
  const withdrawOffer = useMutation(api.offers.withdraw);
  const cancel = useMutation(api.marketplace.cancelShipment);
  const issue = useAction(api.deliveries.issueCode);
  const prepareDeliveryShare = useAction(api.deliveries.prepareDeliveryShare);
  const handover = useAction(api.deliveries.confirmHandover);
  const deliver = useAction(api.deliveries.confirmDelivery);
  const dispute = useMutation(api.deliveries.raiseDispute);
  const payment = useAction(api.payments.initialize);
  const profile = useMutation(api.accounts.ensureProfile);
  const bootstrapProfile = useMutation(api.accounts.bootstrapProfile);
  const normalizeUnverifiedPhone = useMutation(api.accounts.normalizeUnverifiedPhone);
  const completeActivation = useMutation(api.accounts.completeActivation);
  const saveActivationName = useMutation(api.accounts.saveActivationName);
  const requestPhoneVerification = useAction(api.accounts.requestPhoneVerification);
  const confirmPhoneVerification = useAction(api.accounts.confirmPhoneVerification);
  const initiateIdentityNumberVerification = useAction(api.accounts.initiateIdentityNumberVerification);
  const verifyIdentityNumberOtp = useAction(api.accounts.verifyIdentityNumberOtp);
  const updateParcelLocation = useMutation(api.deliveries.updateLocation);
  const updateContactDetails = useMutation(api.accounts.updateContactDetails);
  const submitIdentity = useMutation(api.accounts.submitIdentity);
  const generateProfileImageUploadUrl = useMutation(api.accounts.generateProfileImageUploadUrl);
  const setProfileImage = useMutation(api.accounts.setProfileImage);
  const requestAccountDeletion = useMutation(api.accounts.requestAccountDeletion);
  const upgradeToTier2Mutation = useMutation(api.accounts.upgradeToTier2);
  const upgradeToTier3Mutation = useMutation(api.accounts.upgradeToTier3);
  const initializeTopUp = useAction(api.wallet.initializeTopUp);
  const verifyTopUp = useAction(api.wallet.verifyTopUp);
  const { signOut } = useAuthActions();
  useEffect(() => {
    const viewer = snapshot?.viewer;
    if (!isAuthenticated || !viewer || viewer.phoneVerificationTime || viewer.phone.trim() === "") return;
    void normalizeUnverifiedPhone({});
  }, [isAuthenticated, normalizeUnverifiedPhone, snapshot?.viewer?.id, snapshot?.viewer?.phone, snapshot?.viewer?.phoneVerificationTime]);
  const actions = useMemo<PassengerActions>(() => {
    const connected = () => { if (offline) throw new Error("You're offline. Reconnect before making changes. Nothing has been submitted."); };
    return {
    createShipment: async input => {
      connected();
      const normalized = { ...input, receiverPhone: normalizePhone(input.receiverPhone) };
      validateShipment(normalized);
      await createShipment({ ...normalized, evidenceIds: normalized.evidenceIds.map(id => id as Id<"evidence">) });
    },
    updateShipment: async (id, input) => {
      connected();
      const normalized = { ...input, receiverPhone: normalizePhone(input.receiverPhone) };
      validateShipment(normalized);
      await updateShipment({ shipmentId: shipmentId(id), ...normalized, evidenceIds: normalized.evidenceIds.map(evidenceId => evidenceId as Id<"evidence">) });
    },
    createTrip: async (input, clientRequestId) => {
      connected();
      validateTrip(input);
      await withResponseDeadline(
        createTrip({ ...input, ...(clientRequestId ? { clientRequestId } : {}) }),
        "Passenger did not receive a response while publishing your trip. Check your connection and try again; the same trip will not be duplicated.",
      );
    },
    updateTrip: async (id, input) => { connected(); validateTrip(input); await updateTrip({ tripId: tripId(id), ...input }); },
    matchShipment: async (id, tId, input) => { connected(); await match({ shipmentId: shipmentId(id), tripId: tripId(tId), ...input }); },
    acceptOffer: async id => { connected(); await acceptOffer({ offerId: offerId(id) }); },
    declineOffer: async id => { connected(); await declineOffer({ offerId: offerId(id) }); },
    withdrawOffer: async id => { connected(); await withdrawOffer({ offerId: offerId(id) }); },
    cancelShipment: async id => { connected(); await cancel({ shipmentId: shipmentId(id) }); },
    issueCode: async (id, kind) => { connected(); return (await issue({ shipmentId: shipmentId(id), kind })).code; },
    prepareDeliveryShare: async id => { connected(); return await prepareDeliveryShare({ shipmentId: shipmentId(id) }); },
    confirmHandover: async (id, code, evidenceIds) => { connected(); await handover({ shipmentId: shipmentId(id), code, evidenceIds: evidenceIds?.map(id => id as Id<"evidence">) }); },
    confirmDelivery: async (id, code, evidenceIds) => { connected(); await deliver({ shipmentId: shipmentId(id), code, evidenceIds: evidenceIds?.map(id => id as Id<"evidence">) }); },
    raiseDispute: async (id, reason) => { connected(); await dispute({ shipmentId: shipmentId(id), reason }); },
    pay: async id => {
      connected();
      const result = await payment({ shipmentId: shipmentId(id) });
      if (!/^https:\/\//i.test(result.url)) throw new Error("The payment provider did not return a secure payment link.");
      try {
        await Linking.openURL(result.url);
      } catch {
        throw new Error("Unable to open the checkout page on this device. Please check your browser settings.");
      }
    },
    ensureProfile: async (name, phone) => { connected(); if (!name.trim() || name.length > 120 || !isValidPhone(phone)) throw new Error("Enter your name and a valid phone number."); await profile({ name, phone: normalizePhone(phone) }); },
    bootstrapProfile: async () => { connected(); await bootstrapProfile({}); },
    normalizeUnverifiedPhone: async () => { connected(); await normalizeUnverifiedPhone({}); },
    completeActivation: async () => { connected(); await completeActivation({}); },
    saveActivationName: async name => { connected(); await saveActivationName({ name }); },
    requestPhoneVerification: async phone => { connected(); return requestPhoneVerification({ phone: normalizePhone(phone) }); },
    confirmPhoneVerification: async code => { connected(); await confirmPhoneVerification({ code }); },
    initiateIdentityNumberVerification: async input => { connected(); return await initiateIdentityNumberVerification(input); },
    verifyIdentityNumberOtp: async input => { connected(); return await verifyIdentityNumberOtp(input); },
    updateParcelLocation: async (id, input) => { connected(); await updateParcelLocation({ shipmentId: shipmentId(id), ...input }); },
    updateContactDetails: async input => { connected(); await updateContactDetails(input); },
    submitIdentity: async input => {
      connected();
      let phone = input.phone || "";
      if (!isPlaceholderPhone(phone)) {
        try {
          phone = normalizePhone(phone);
        } catch {
          // Keep raw phone so backend can safely process or preserve user.phone
        }
      }
      await submitIdentity({ ...input, phone, evidenceIds: input.evidenceIds.map(id => id as Id<"evidence">) });
    },
    requestAccountDeletion: async () => { connected(); await requestAccountDeletion({}); },
    updateProfileImage: async ({ uri, contentType }) => {
      connected();
      const uploadUrl = await generateProfileImageUploadUrl({});
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory) throw new Error("Passenger could not read that photo from your device.");
      let response: Awaited<ReturnType<typeof expoFetch>>;
      try {
        response = await expoFetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": contentType || "image/jpeg" },
          body: new ExpoFile(uri),
        });
      } catch {
        throw new Error("We could not upload your profile photo. Please check your connection and try again.");
      }
      if (response.status < 200 || response.status >= 300) throw new Error("The profile photo upload failed. Please try again.");
      let payload: { storageId?: Id<"_storage"> };
      try {
        payload = (await response.json()) as { storageId?: Id<"_storage"> };
      } catch {
        throw new Error("Unable to read the profile photo upload response. Please try again.");
      }
      if (!payload?.storageId) throw new Error("The profile photo upload did not finish.");
      await setProfileImage({ storageId: payload.storageId });
    },
    topUpWallet: async (amountNaira: number) => {
      connected();
      const result = await initializeTopUp({ amountNaira });
      return result;
    },
    verifyWalletTopUp: async (reference: string) => {
      connected();
      return await verifyTopUp({ reference });
    },
    upgradeToTier2: async (bvn: string) => {
      connected();
      await upgradeToTier2Mutation({ bvn });
    },
    upgradeToTier3: async (input) => {
      connected();
      await upgradeToTier3Mutation(input);
    },
      signOut: async () => { openAuthSignInScreen(); await signOut(); },
    };
  }, [
    acceptOffer,
    bootstrapProfile,
    completeActivation,
    cancel,
    confirmPhoneVerification,
    initiateIdentityNumberVerification,
    verifyIdentityNumberOtp,
    createShipment,
    createTrip,
    declineOffer,
    deliver,
    dispute,
    generateProfileImageUploadUrl,
    handover,
    initializeTopUp,
    issue,
    match,
    offline,
    payment,
    prepareDeliveryShare,
    profile,
    requestAccountDeletion,
    requestPhoneVerification,
    saveActivationName,
    setProfileImage,
    signOut,
    submitIdentity,
    updateContactDetails,
    updateParcelLocation,
    updateShipment,
    updateTrip,
    upgradeToTier2Mutation,
    upgradeToTier3Mutation,
    verifyTopUp,
    withdrawOffer,
  ]);
  const state = useMemo<PassengerState>(() => ({
    snapshot,
    offline,
    authLoading: isLoading,
    authError: !isLoading && !isAuthenticated ? "Your session could not connect to Passenger authentication. Sign in again." : undefined,
  }), [isAuthenticated, isLoading, offline, snapshot]);
  const value = useMemo<PassengerData>(() => ({ ...state, ...actions }), [actions, state]);
  return <StateContext.Provider value={state}><ActionsContext.Provider value={actions}><DataContext.Provider value={value}>{children}</DataContext.Provider></ActionsContext.Provider></StateContext.Provider>;
}
