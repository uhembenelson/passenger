import React, { createContext, useContext } from "react";
import { Linking } from "react-native";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import * as FileSystem from "expo-file-system/legacy";
import { useNetworkState } from "expo-network";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { isValidPhone, validateShipment, validateTrip } from "@passenger/core";
import type { CreateShipmentInput, CreateTripInput, DashboardSnapshot, DocumentType } from "@passenger/core";
import { openAuthSignInScreen } from "./auth";

export interface PassengerData {
  snapshot: DashboardSnapshot | undefined;
  authLoading: boolean;
  offline: boolean;
  authError?: string;
  createShipment: (input: CreateShipmentInput) => Promise<void>;
  updateShipment: (shipmentId: string, input: CreateShipmentInput) => Promise<void>;
  createTrip: (input: CreateTripInput) => Promise<void>;
  updateTrip: (tripId: string, input: CreateTripInput) => Promise<void>;
  matchShipment: (shipmentId: string, tripId: string, input: { expiresAt: number; note: string }) => Promise<void>;
  acceptOffer: (offerId: string) => Promise<void>;
  declineOffer: (offerId: string) => Promise<void>;
  withdrawOffer: (offerId: string) => Promise<void>;
  cancelShipment: (shipmentId: string) => Promise<void>;
  issueCode: (shipmentId: string, kind: "handover" | "delivery") => Promise<string | undefined>;
  prepareDeliveryShare: (shipmentId: string) => Promise<{ code: string; receiverPhone: string; reference: string }>;
  confirmHandover: (shipmentId: string, code: string) => Promise<void>;
  confirmDelivery: (shipmentId: string, code: string) => Promise<void>;
  raiseDispute: (shipmentId: string, reason: string) => Promise<void>;
  pay: (shipmentId: string) => Promise<void>;
  ensureProfile: (name: string, phone: string) => Promise<void>;
  bootstrapProfile: () => Promise<void>;
  requestPhoneVerification: (phone: string) => Promise<{ phone: string; resendAt: number; expiresAt: number; previewCode?: string }>;
  confirmPhoneVerification: (code: string) => Promise<void>;
  updateParcelLocation: (shipmentId: string, input: { latitude: number; longitude: number; place: string }) => Promise<void>;
  updateContactDetails: (input: { email?: string; name?: string; image?: string }) => Promise<void>;
  updateProfileImage: (input: { uri: string; contentType?: string }) => Promise<void>;
  submitIdentity: (input: { name: string; phone: string; documentType: DocumentType; evidenceIds: string[] }) => Promise<void>;
  requestAccountDeletion: () => Promise<void>;
  topUpWallet: (amountNaira: number) => Promise<{ mode: "provider"; url: string; reference: string } | { mode: "manual"; reference: string; balanceNaira: number }>;
  verifyWalletTopUp: (reference: string) => Promise<{ success: boolean; balanceNaira: number }>;
  upgradeToTier2: (bvn: string) => Promise<void>;
  upgradeToTier3: (input: { state: string; lga: string; address: string; streetPhotoUrl?: string; housePhotoUrl?: string }) => Promise<void>;
  signOut: () => Promise<void>;
}
const DataContext = createContext<PassengerData | null>(null);
export function usePassenger() {
  const value = useContext(DataContext);
  if (!value) throw new Error("Passenger data provider is missing.");
  return value;
}
export const shipmentId = (id: string) => id as Id<"shipments">;
export const tripId = (id: string) => id as Id<"trips">;
export const offerId = (id: string) => id as Id<"offers">;

export function LiveDataProvider({ children }: React.PropsWithChildren) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const snapshot = useQuery(api.marketplace.dashboard, isAuthenticated ? {} : "skip") as DashboardSnapshot | undefined;
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
  const requestPhoneVerification = useAction(api.accounts.requestPhoneVerification);
  const confirmPhoneVerification = useMutation(api.accounts.confirmPhoneVerification);
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
  const connected = () => { if (offline) throw new Error("You're offline. Reconnect before making changes. Nothing has been submitted."); };
  const value: PassengerData = {
    snapshot, offline, authLoading: isLoading,
    authError: !isLoading && !isAuthenticated ? "Your session could not connect to Passenger authentication. Sign in again." : undefined,
    createShipment: async input => { connected(); validateShipment(input); await createShipment({ ...input, evidenceIds: input.evidenceIds.map(id => id as Id<"evidence">) }); },
    updateShipment: async (id, input) => { connected(); validateShipment(input); await updateShipment({ shipmentId: shipmentId(id), ...input, evidenceIds: input.evidenceIds.map(evidenceId => evidenceId as Id<"evidence">) }); },
    createTrip: async input => { connected(); validateTrip(input); await createTrip(input); },
    updateTrip: async (id, input) => { connected(); validateTrip(input); await updateTrip({ tripId: tripId(id), ...input }); },
    matchShipment: async (id, tId, input) => { connected(); await match({ shipmentId: shipmentId(id), tripId: tripId(tId), ...input }); },
    acceptOffer: async id => { connected(); await acceptOffer({ offerId: offerId(id) }); },
    declineOffer: async id => { connected(); await declineOffer({ offerId: offerId(id) }); },
    withdrawOffer: async id => { connected(); await withdrawOffer({ offerId: offerId(id) }); },
    cancelShipment: async id => { connected(); await cancel({ shipmentId: shipmentId(id) }); },
    issueCode: async (id, kind) => { connected(); return (await issue({ shipmentId: shipmentId(id), kind })).code; },
    prepareDeliveryShare: async id => { connected(); return await prepareDeliveryShare({ shipmentId: shipmentId(id) }); },
    confirmHandover: async (id, code) => { connected(); await handover({ shipmentId: shipmentId(id), code }); },
    confirmDelivery: async (id, code) => { connected(); await deliver({ shipmentId: shipmentId(id), code }); },
    raiseDispute: async (id, reason) => { connected(); await dispute({ shipmentId: shipmentId(id), reason }); },
    pay: async id => { connected(); const result = await payment({ shipmentId: shipmentId(id) }); if (!/^https:\/\//i.test(result.url)) throw new Error("The payment provider did not return a secure payment link."); await Linking.openURL(result.url); },
    ensureProfile: async (name, phone) => { connected(); if (!name.trim() || name.length > 120 || !isValidPhone(phone)) throw new Error("Enter your name and a valid phone number."); await profile({ name, phone }); },
    bootstrapProfile: async () => { connected(); await bootstrapProfile({}); },
    requestPhoneVerification: async phone => { connected(); if (!isValidPhone(phone)) throw new Error("Enter a valid phone number."); return requestPhoneVerification({ phone }); },
    confirmPhoneVerification: async code => { connected(); await confirmPhoneVerification({ code }); },
    updateParcelLocation: async (id, input) => { connected(); await updateParcelLocation({ shipmentId: shipmentId(id), ...input }); },
    updateContactDetails: async input => { connected(); await updateContactDetails(input); },
    submitIdentity: async input => {
      connected();
      await submitIdentity({ ...input, evidenceIds: input.evidenceIds.map(id => id as Id<"evidence">) });
    },
    requestAccountDeletion: async () => { connected(); await requestAccountDeletion({}); },
    updateProfileImage: async ({ uri, contentType }) => {
      connected();
      const uploadUrl = await generateProfileImageUploadUrl({});
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory) throw new Error("Passenger could not read that photo from your device.");
      const response = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType || "image/jpeg" },
      });
      if (response.status < 200 || response.status >= 300) throw new Error("The profile photo upload failed. Please try again.");
      const payload = JSON.parse(response.body) as { storageId?: Id<"_storage"> };
      if (!payload.storageId) throw new Error("The profile photo upload did not finish.");
      await setProfileImage({ storageId: payload.storageId });
    },
    topUpWallet: async (amountNaira: number) => {
      connected();
      const result = await initializeTopUp({ amountNaira });
      if (result.mode === "provider") {
        if (!/^https:\/\//i.test(result.url)) throw new Error("The payment provider did not return a secure payment link.");
        await Linking.openURL(result.url);
      }
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
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
