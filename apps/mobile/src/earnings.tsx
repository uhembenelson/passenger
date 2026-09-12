import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowDownLeft, Banknote, Building2, ChevronRight, Clock3 } from "lucide-react-native";
import { useAction, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import { usePassengerState } from "./data";
import { IdentityVerificationCard } from "./identity-verification-card";
import { BackButton, Badge, Button, colors, errorMessage, Field, fontFamily, InlineSkeleton, Notice, PresentationSheet, Txt } from "./ui";

const money = (kobo: number) => `NGN ${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const date = (time: number) => new Date(time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const labels: Record<string, string> = { paid: "Paid", scheduled: "Scheduled", processing: "Processing", held: "On hold", bank_required: "Add bank account", verification_required: "Verify identity", failed: "Payout failed" };

export function EarningsScreen({ onBack, onStartEarning }: { onBack: () => void; onStartEarning?: () => void }) {
  const earnings = useQuery(api.finance.earnings, {});
  const bank = useQuery(api.finance.bankAccount, {});
  const [bankOpen, setBankOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const item = earnings?.find(entry => entry.id === selected);
  const total = earnings?.reduce((sum, entry) => sum + entry.amountKobo, 0) ?? 0;
  const paid = earnings?.filter(entry => entry.status === "paid").reduce((sum, entry) => sum + entry.amountKobo, 0) ?? 0;

  return <View style={e.screen}>
    <ScrollView contentContainerStyle={e.page}>
      <View style={e.header}>
        <BackButton accessibilityLabel="Back to profile" onPress={onBack} />
        <Txt style={e.title}>Earnings</Txt>
        <View style={{ width: 40 }} />
      </View>
      {earnings === undefined ? <InlineSkeleton label="Loading earnings" /> : <>
        <View style={e.balance}>
          <View style={e.balanceIcon}><Banknote size={24} color="#10B981" strokeWidth={2} /></View>
          <Txt style={e.balanceLabel}>Total earned</Txt>
          <Txt style={e.amount}>{money(total)}</Txt>
          {earnings.length > 0 && <Txt style={[e.caption, { marginTop: 6 }]}>After the 10% platform fee</Txt>}
        </View>
        {earnings.length > 0 && <View style={e.totals}>
          <View style={e.stat}><Txt style={e.caption}>Pending payout</Txt><Txt style={e.subAmount}>{money(total - paid)}</Txt></View>
          <View style={e.statDivider} />
          <View style={e.stat}><Txt style={e.caption}>Paid to bank</Txt><Txt style={e.subAmount}>{money(paid)}</Txt></View>
        </View>}
        <View style={e.activity}>
          <Txt style={e.heading}>Activity</Txt>
          {!earnings.length ? <View style={e.empty}>
            <View style={e.emptyIcon}><Banknote size={26} color={colors.forest} strokeWidth={1.6} /></View>
            <Txt style={e.emptyTitle}>Start earning</Txt>
            <Txt style={e.emptyDetail}>Share space on your next trip. Deliver parcels along your route and earn extra.</Txt>
            {onStartEarning && <Button title="Start earning" onPress={onStartEarning} style={e.startButton} />}
          </View> : <View style={e.activityList}>{earnings.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`View payout for ${entry.origin} to ${entry.destination}`} onPress={() => setSelected(entry.id)} style={e.history}>
            <View style={e.routeIcon}><ArrowDownLeft size={20} color="#10B981" /></View>
            <View style={e.flex}><Txt style={e.label}>{entry.origin} to {entry.destination}</Txt><Txt style={e.caption}>{date(entry.deliveredAt)}</Txt><Txt style={[e.caption, { color: entry.status === "paid" ? colors.forest : colors.muted }]}>{labels[entry.status]}</Txt></View>
            <Txt style={e.label}>{money(entry.amountKobo)}</Txt><ChevronRight size={16} color={colors.muted} />
          </Pressable>)}</View>}
        </View>
        <View style={e.payoutSection}>
          <Txt style={e.heading}>Payouts</Txt>
          <Pressable accessibilityRole="button" onPress={() => setBankOpen(true)} style={e.bank}>
            <Building2 size={22} color="#1F2937" strokeWidth={1.8} /><View style={e.flex}><Txt style={e.label}>Payout account</Txt><Txt style={e.caption}>{bank === undefined ? "Loading account…" : bank?.ready ? `${bank.accountName} · •••• ${bank.last4}` : "Add your bank account"}</Txt></View><ChevronRight size={20} color="#9CA3AF" />
          </Pressable>
          <View style={e.info}><Clock3 size={16} color="#6B7280" /><Txt style={[e.caption, { flex: 1 }]}>Payouts are automatic, 24 hours after confirmed delivery. Bank processing times may vary.</Txt></View>
        </View>
      </>}
    </ScrollView>
    {item && <PresentationSheet title="Payout details" onClose={() => setSelected(null)}>
      <View style={e.sheet}>
        <Txt style={e.amount}>{money(item.amountKobo)}</Txt>
        <Badge label={labels[item.status]!} tone={item.status === "paid" ? "green" : "amber"} />
        <Txt style={e.label}>{item.origin} to {item.destination}</Txt>
        <Txt style={e.muted}>{item.reference} · Delivered {date(item.deliveredAt)}</Txt>
        <Txt style={e.muted}>{item.status === "paid" ? "Your payout has been sent to your bank." : item.status === "failed" ? "Your bank transfer did not complete. Contact support so we can check it." : item.status === "held" ? "This payout is on hold while we review the delivery or its payment. Contact support if you need help." : item.status === "verification_required" ? "Complete identity verification in Account Tier to receive your payout." : item.status === "bank_required" ? "Add your bank account. Once verified, any earnings past the 24-hour wait are processed automatically." : item.status === "processing" ? "Your transfer is processing. You do not need to request another payout." : `Automatic payout from ${item.payoutAt ? date(item.payoutAt) : "24 hours after confirmed delivery"}. Bank processing times may vary.`}</Txt>
        <Txt style={e.caption}>Amount shown is after the 10% platform fee.</Txt>
        {item.status === "bank_required" && <Button title="Add payout account" onPress={() => { setSelected(null); setBankOpen(true); }} />}
        <Button title="Done" variant="secondary" onPress={() => setSelected(null)} />
      </View>
    </PresentationSheet>}
    {bankOpen && <PayoutAccount onClose={() => setBankOpen(false)} />}
  </View>;
}

function PayoutAccount({ onClose }: { onClose: () => void }) {
  const { offline, snapshot } = usePassengerState();
  const bank = useQuery(api.finance.bankAccount, {});
  const getBanks = useAction(api.finance.banks);
  const saveBank = useAction(api.finance.setupBank);
  const [banks, setBanks] = useState<Array<{ code: string; name: string }> | null>(null);
  const [search, setSearch] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const verified = snapshot?.viewer?.verification === "verified" && !snapshot.viewer.suspended;
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } };
  return <PresentationSheet title="Payout account" onClose={onClose}>
    <View style={e.sheet}>
      <Txt style={e.muted}>Automatic payouts go straight to your Nigerian bank account.</Txt>
      {bank?.ready && <View style={e.savedBank}><Txt style={e.label}>{bank.accountName}</Txt><Txt style={e.muted}>Account ending {bank.last4}</Txt><Badge label="Verified" tone="green" /></View>}
      {saved ? <><Notice tone="success">Bank account saved. Your eligible earnings will be paid automatically.</Notice><Button title="Done" onPress={onClose} /></> : <>
        {snapshot?.viewer && snapshot.viewer.verification !== "verified" && <IdentityVerificationCard viewer={snapshot.viewer} />}
        {snapshot?.viewer?.suspended && <Notice>Your account is suspended. Contact support before updating your payout account.</Notice>}
        {offline && <Notice>Reconnect to update your payout account.</Notice>}
        {!banks ? <Button title={bank?.ready ? "Change bank account" : "Choose bank"} variant="secondary" busy={busy} disabled={offline || !verified} onPress={() => void act(async () => setBanks(await getBanks({})))} /> : <>
          <Field label="Find your bank" value={search} onChangeText={setSearch} editable={!busy} />
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {banks.filter(b => b.name.toLowerCase().includes(search.toLowerCase())).map(b => <Pressable key={b.code} accessibilityRole="radio" accessibilityState={{ checked: bankCode === b.code }} disabled={busy} onPress={() => setBankCode(b.code)} style={[e.bankChoice, bankCode === b.code && { backgroundColor: colors.soft }]}><Txt style={e.label}>{b.name}</Txt>{bankCode === b.code && <Badge label="Selected" tone="green" />}</Pressable>)}
            {!banks.some(b => b.name.toLowerCase().includes(search.toLowerCase())) && <Txt style={e.muted}>No banks found. Try another name.</Txt>}
          </ScrollView>
          <Field label="Account number" value={accountNumber} onChangeText={value => setAccountNumber(value.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={10} editable={!busy} hint="Enter your 10-digit account number." />
          <Button title="Verify and save account" busy={busy} disabled={offline || !verified || !bankCode || accountNumber.length !== 10} onPress={() => void act(async () => { await saveBank({ bankCode, accountNumber }); setAccountNumber(""); setSaved(true); })} />
        </>}
      </>}
      {!!error && <Notice tone="error">{error}</Notice>}
    </View>
  </PresentationSheet>;
}

const e = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F9F9FB" },
  page: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28, marginTop: 8 },
  title: { fontSize: 18, fontFamily: fontFamily.semibold, color: "#1F2937" },
  heading: { fontSize: 18, fontFamily: fontFamily.semibold, color: "#1F2937", marginBottom: 16 },
  muted: { fontSize: 14, lineHeight: 21, color: "#4B5563" },
  caption: { fontSize: 12, lineHeight: 19, color: "#6B7280" },
  label: { fontSize: 14, fontFamily: fontFamily.medium, color: "#1F2937" },
  balance: { alignItems: "center", marginTop: 8 },
  balanceIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  balanceLabel: { fontSize: 15, fontFamily: fontFamily.medium, color: "#4B5563", marginBottom: 6 },
  amount: { fontSize: 30, fontFamily: fontFamily.semibold, color: "#111827", letterSpacing: -0.5 },
  subAmount: { fontSize: 18, fontFamily: fontFamily.semibold, color: "#111827", marginTop: 4 },
  totals: { flexDirection: "row", alignItems: "center", paddingVertical: 20, marginTop: 24, backgroundColor: "#FFFFFF", borderRadius: 16 },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, height: 32, backgroundColor: "#F3F4F6" },
  activity: { marginTop: 36 },
  activityList: { backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden" },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 32, gap: 10, backgroundColor: "#FFFFFF", borderRadius: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: "#EAF3DD", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.text, textAlign: "center" },
  emptyDetail: { fontSize: 13, lineHeight: 20, color: "#4B5563", textAlign: "center", maxWidth: 280 },
  startButton: { marginTop: 10, minWidth: 160, borderRadius: 999, backgroundColor: "#22C55E" },
  flex: { flex: 1, gap: 3 },
  payoutSection: { marginTop: 28 },
  info: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 14, paddingHorizontal: 4 },
  bank: { flexDirection: "row", gap: 14, alignItems: "center", padding: 18, backgroundColor: "#FFFFFF", borderRadius: 16 },
  history: { flexDirection: "row", gap: 10, alignItems: "center", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#F3F4F6" },
  routeIcon: { width: 32, alignItems: "center", justifyContent: "center" },
  sheet: { gap: 18, paddingBottom: 16 },
  savedBank: { padding: 20, borderRadius: 16, backgroundColor: "#F9F9FB", gap: 8 },
  bankChoice: { minHeight: 48, padding: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 10 },
});
