import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { usePassengerState } from "./data";
import { Badge, Button, Card, errorMessage, Field, Hydrated, InlineSkeleton, Notice, s, SectionTitle, Txt } from "./ui";
import { normalizeAccountNumber, searchBanks } from "./bank-search";

type Readiness = {
  smsConfigured: boolean;
  paymentsConfigured: boolean;
  bankingConfigured: boolean;
  bankingProvider: "v4" | "none";
  walletFundingMode: "provider" | "manual";
  platformFeePercent: 10;
  disputeWindowHours: number;
};

type Bank = { code: string; name: string };
type BankAccount = { accountName: string; bankCode: string; last4: string; ready: boolean; verifiedAt?: number } | null;

export function BankDetails() {
  const { snapshot, offline } = usePassengerState();
  const viewer = snapshot?.viewer;
  const readiness = useQuery(api.accounts.readiness, viewer ? {} : "skip") as Readiness | undefined;
  const bank = useQuery(api.finance.bankAccount, viewer ? {} : "skip") as BankAccount | undefined;
  const banksAction = useAction(api.finance.banks);
  const setupBank = useAction(api.finance.setupBank);
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedBank = useMemo(() => banks?.find(item => item.code === bankCode), [banks, bankCode]);
  const matchingBanks = useMemo(() => banks ? searchBanks(banks, bankSearch) : [], [banks, bankSearch]);
  if (!viewer) return null;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };

  const bankReady = !!bank?.ready;
  const verified = viewer.verification === "verified" && !viewer.suspended;

  return <View style={{ gap: 18 }}>
    <Card>
      <SectionTitle title="Funding and provider readiness" subtitle="Passenger shows when wallet funding is using the temporary in-app path versus the live external providers." />
      {readiness === undefined
        ? <InlineSkeleton label="Checking provider readiness" />
        : <Hydrated><View style={{ gap: 12 }}>
          <View style={s.wrap}>
            <Badge label={readiness.walletFundingMode === "manual" ? "Wallet funding uses in-app mode" : "Wallet funding uses provider checkout"} tone={readiness.walletFundingMode === "manual" ? "amber" : "green"} />
            <Badge label={readiness.bankingConfigured ? "V4 payouts configured" : "Provider payouts not configured"} tone={readiness.bankingConfigured ? "green" : "amber"} />
            <Badge label={readiness.smsConfigured ? "Receiver SMS configured" : "Receiver SMS not configured"} tone={readiness.smsConfigured ? "green" : "amber"} />
            <Badge label={`${readiness.platformFeePercent}% platform fee`} tone="neutral" />
            <Badge label={`${readiness.disputeWindowHours}-hour dispute window`} tone="neutral" />
          </View>
          {readiness.walletFundingMode === "manual" && <Notice tone="warning">Paystack top-up is not configured yet, so provider-backed wallet funding remains unavailable. Bank verification and traveller payouts use their separately configured provider.</Notice>}
          {!readiness.bankingConfigured && <Notice tone="warning">Bank verification and traveller payouts are not configured on this deployment yet.</Notice>}
          {!readiness.smsConfigured && <Notice tone="warning">Receiver delivery-code SMS is not configured on this deployment yet. Final delivery proof fails closed until Twilio credentials are set.</Notice>}
        </View></Hydrated>}
    </Card>

    <Card>
      <SectionTitle title="Traveller payout bank details" subtitle="Required before a delivered parcel can become payout-eligible after the dispute window." />
      {!verified && <Notice tone="warning">Verify your identity before resolving bank details. Passenger only verifies payout recipients for active, verified members.</Notice>}
      {viewer.suspended && <Notice tone="error">Bank setup is unavailable while your account is suspended.</Notice>}
      {bank === undefined
        ? <InlineSkeleton label="Loading saved bank details" />
        : bankReady
          ? <View style={{ gap: 12 }}>
            <Badge label={`Ready · ${bank.accountName} · •••• ${bank.last4}`} tone="green" />
            <Txt style={s.hint}>Verified {bank.verifiedAt ? new Date(bank.verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "recently"} through the configured banking provider.</Txt>
          </View>
          : <Notice>Add your Nigerian bank account so Passenger can verify a transfer recipient for future traveller payouts.</Notice>}
      <View style={{ marginTop: 16 }}>
        <Button title={banks ? "Refresh supported banks" : "Load supported banks"} variant="secondary" busy={busy === "banks"} disabled={offline || !!busy || !readiness?.bankingConfigured || !verified} onPress={() => void act("banks", async () => {
          const result = await banksAction({});
          setBanks(result);
          setNotice(`Loaded ${result.length} banks from the banking provider.`);
        })} />
      </View>
      {banks && <View style={{ marginTop: 16, gap: 10 }}>
        {selectedBank ? <View style={bankUi.selected}>
          <View style={{ flex: 1, gap: 4 }}><Txt style={s.hint}>Selected payout bank</Txt><Txt style={s.label}>{selectedBank.name}</Txt></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Change selected bank" disabled={!!busy || offline} onPress={() => { setBankCode(""); setBankSearch(""); }}><Txt style={bankUi.change}>Change</Txt></Pressable>
        </View> : <>
          <Field label="Find your bank" value={bankSearch} onChangeText={setBankSearch} editable={!busy && !offline} placeholder="Search by bank name" />
          <ScrollView style={bankUi.results} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {matchingBanks.map(item => <Pressable key={item.code} accessibilityRole="radio" disabled={!!busy || offline} onPress={() => setBankCode(item.code)} style={bankUi.choice}><Txt style={s.label}>{item.name}</Txt></Pressable>)}
            {!matchingBanks.length && <Txt style={s.hint}>No banks found. Search using another bank name.</Txt>}
          </ScrollView>
          {matchingBanks.length === 50 && <Txt style={s.hint}>Showing the first 50 matches. Type more of the bank name to narrow the list.</Txt>}
        </>}
      </View>}
      <View style={{ marginTop: 16 }}>
        <Field label="10-digit account number" value={accountNumber} onChangeText={value => setAccountNumber(normalizeAccountNumber(value))} inputMode="numeric" editable={!busy && !offline && !!readiness?.bankingConfigured && verified} hint={selectedBank ? `Selected bank: ${selectedBank.name}` : "Enter or paste the account number after choosing the correct bank."} />
      </View>
      {error !== "" && <Notice tone="error">{error}</Notice>}
      {notice !== "" && <Notice tone="success">{notice}</Notice>}
      <Button title={bankReady ? "Verify a replacement bank account" : "Verify this bank account"} busy={busy === "setup"} disabled={offline || !!busy || !readiness?.bankingConfigured || !verified || !bankCode || !/^\d{10}$/.test(accountNumber)} onPress={() => void act("setup", async () => {
        const result = await setupBank({ bankCode, accountNumber });
        setAccountNumber("");
        setNotice(`Recipient verified for ${result.accountName} · •••• ${result.last4}.`);
      })} />
      <Txt style={[s.hint, { marginTop: 12 }]}>Passenger verifies the recipient through the configured banking provider before payout requests. Delivery, disputes, and provider status still decide whether money can move.</Txt>
    </Card>
  </View>;
}

const bankUi = StyleSheet.create({
  results: { maxHeight: 260 },
  selected: { padding: 14, borderRadius: 12, backgroundColor: "#F2F6EC", flexDirection: "row", alignItems: "center", gap: 12 },
  change: { color: "#1F4D3B", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  choice: { minHeight: 52, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 10 },
});
