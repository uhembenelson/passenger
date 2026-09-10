import React, { useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { usePassenger } from "./data";
import { Badge, Button, Card, colors, errorMessage, Field, Notice, s, SectionTitle, Txt } from "./ui";

type Readiness = {
  smsConfigured: boolean;
  paymentsConfigured: boolean;
  walletFundingMode: "provider" | "manual";
  platformFeePercent: 10;
  disputeWindowHours: number;
};

type Bank = { code: string; name: string };
type BankAccount = { accountName: string; bankCode: string; last4: string; ready: boolean; verifiedAt?: number } | null;

export function BankDetails() {
  const { snapshot, offline } = usePassenger();
  const viewer = snapshot?.viewer;
  const readiness = useQuery(api.accounts.readiness, viewer ? {} : "skip") as Readiness | undefined;
  const bank = useQuery(api.finance.bankAccount, viewer ? {} : "skip") as BankAccount | undefined;
  const banksAction = useAction(api.finance.banks);
  const setupBank = useAction(api.finance.setupBank);
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedBank = useMemo(() => banks?.find(item => item.code === bankCode), [banks, bankCode]);
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
        ? <View style={[s.row, { gap: 10 }]}><ActivityIndicator color={colors.forest} /><Txt style={s.hint}>Checking provider readiness…</Txt></View>
        : <View style={{ gap: 12 }}>
          <View style={s.wrap}>
            <Badge label={readiness.walletFundingMode === "manual" ? "Wallet funding uses in-app mode" : "Wallet funding uses provider checkout"} tone={readiness.walletFundingMode === "manual" ? "amber" : "green"} />
            <Badge label={readiness.paymentsConfigured ? "Provider payouts configured" : "Provider payouts not configured"} tone={readiness.paymentsConfigured ? "green" : "amber"} />
            <Badge label={readiness.smsConfigured ? "Receiver SMS configured" : "Receiver SMS not configured"} tone={readiness.smsConfigured ? "green" : "amber"} />
            <Badge label={`${readiness.platformFeePercent}% platform fee`} tone="neutral" />
            <Badge label={`${readiness.disputeWindowHours}-hour dispute window`} tone="neutral" />
          </View>
          {readiness.walletFundingMode === "manual" && <Notice tone="warning">Paystack top-up is not configured yet, so wallet funding currently completes directly inside Passenger for this build. Parcel posting and wallet holds work; provider-backed payouts and bank verification still wait on the real integration.</Notice>}
          {!readiness.paymentsConfigured && readiness.walletFundingMode !== "manual" && <Notice tone="warning">Paystack is not configured on this deployment yet. Hosted checkout, bank recipient verification, and payout/refund operations remain blocked until the backend receives a provider key.</Notice>}
          {!readiness.smsConfigured && <Notice tone="warning">Receiver delivery-code SMS is not configured on this deployment yet. Final delivery proof fails closed until Twilio credentials are set.</Notice>}
        </View>}
    </Card>

    <Card>
      <SectionTitle title="Traveller payout bank details" subtitle="Required before a delivered parcel can become payout-eligible after the dispute window." />
      {!verified && <Notice tone="warning">Verify your identity before resolving bank details. Passenger only verifies payout recipients for active, verified members.</Notice>}
      {viewer.suspended && <Notice tone="error">Bank setup is unavailable while your account is suspended.</Notice>}
      {bank === undefined
        ? <View style={[s.row, { gap: 10 }]}><ActivityIndicator color={colors.forest} /><Txt style={s.hint}>Loading saved bank details…</Txt></View>
        : bankReady
          ? <View style={{ gap: 12 }}>
            <Badge label={`Ready · ${bank.accountName} · •••• ${bank.last4}`} tone="green" />
            <Txt style={s.hint}>Resolved bank code {bank.bankCode}. Verified {bank.verifiedAt ? new Date(bank.verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "recently"} through Paystack. Full account numbers are not retained in Passenger.</Txt>
          </View>
          : <Notice>Add your Nigerian bank account so Passenger can verify a transfer recipient for future traveller payouts.</Notice>}
      <View style={{ marginTop: 16 }}>
        <Button title={banks ? "Refresh supported banks" : "Load supported banks"} variant="secondary" busy={busy === "banks"} disabled={offline || !!busy || !readiness?.paymentsConfigured || !verified} onPress={() => void act("banks", async () => {
          const result = await banksAction({});
          setBanks(result);
          if (!bankCode && result[0]) setBankCode(result[0].code);
          setNotice(`Loaded ${result.length} banks from Paystack.`);
        })} />
      </View>
      {banks && <View style={{ marginTop: 16, gap: 10 }}>
        <Txt style={s.label}>Choose your bank</Txt>
        <View style={s.wrap}>{banks.slice(0, 18).map(item => <Button key={item.code} title={item.name} small variant={bankCode === item.code ? "primary" : "secondary"} disabled={!!busy || offline} onPress={() => setBankCode(item.code)} />)}</View>
        {banks.length > 18 && <Txt style={s.hint}>Showing the first 18 banks for this compact screen. The selected bank code is what Passenger sends to Paystack for recipient verification.</Txt>}
      </View>}
      <View style={{ marginTop: 16 }}>
        <Field label="10-digit account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" maxLength={10} editable={!busy && !offline && !!readiness?.paymentsConfigured && verified} hint={selectedBank ? `Selected bank: ${selectedBank.name}` : "Load the bank list, then choose the correct bank."} />
      </View>
      {error !== "" && <Notice tone="error">{error}</Notice>}
      {notice !== "" && <Notice tone="success">{notice}</Notice>}
      <Button title={bankReady ? "Verify a replacement bank account" : "Verify this bank account"} busy={busy === "setup"} disabled={offline || !!busy || !readiness?.paymentsConfigured || !verified || !bankCode || !/^\d{10}$/.test(accountNumber)} onPress={() => void act("setup", async () => {
        const result = await setupBank({ bankCode, accountNumber });
        setAccountNumber("");
        setNotice(`Recipient verified for ${result.accountName} · •••• ${result.last4}.`);
      })} />
      <Txt style={[s.hint, { marginTop: 12 }]}>Passenger verifies the recipient through Paystack before payout requests. Delivery, disputes, and provider status still decide whether money can move.</Txt>
    </Card>
  </View>;
}
