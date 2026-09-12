import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Keyboard, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Wallet, ArrowDownLeft, ArrowUpRight, ReceiptText, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react-native";
import { primitives, semantic } from "@passenger/design-tokens";
import { money } from "@passenger/core";
import type { WalletTransaction } from "@passenger/core";
import { api } from "@passenger/backend/convex/_generated/api";
import { usePassenger } from "./data";
import * as SecureStore from "expo-secure-store";
import { parseDepositAmount, suggestedDeposit } from "./wallet-top-up";
import { Button, Card, colors, ContentSkeleton, errorMessage, Field, fontFamily, FullScreenState, Notice, PresentationSheet, s, SectionTitle, Sheet, shortDate, Txt } from "./ui";

export function WalletBalanceCard({ onTopUp }: { onTopUp: () => void }) {
  const wallet = useQuery(api.wallet.balance, {});
  const balance = wallet?.balanceNaira ?? 0;

  return (
    <Card style={w.card}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
        <View style={[s.row, { gap: 10, alignItems: "center" }]}>
          <View style={w.iconShell}>
            <Wallet size={20} color={colors.forest} strokeWidth={2} />
          </View>
          <View>
            <Txt style={w.balanceLabel}>{wallet?.blocked ? "Wallet under review" : "Available balance"}</Txt>
            <Txt style={w.balanceAmount}>{money(balance)}</Txt>
          </View>
        </View>
        <Button title="Top up" small variant="lime" onPress={onTopUp} />
      </View>
      <View style={[s.row, { gap: 6, marginTop: 12, alignItems: "center" }]}>
        <ShieldCheck size={14} color={semantic.color.text.tertiary} />
        <Txt style={w.balanceSub}>
          Add money securely with Paystack.
        </Txt>
      </View>
    </Card>
  );
}

export function TopUpSheet({
  minRequiredAmount,
  onClose,
  onSuccess,
}: {
  minRequiredAmount?: number;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { topUpWallet, verifyWalletTopUp, offline, snapshot } = usePassenger();
  const pendingDeposit = useQuery(api.wallet.pendingDeposit, {});
  const config = snapshot?.mobileConfig?.wallet;
  const minimum = config?.minTopUpNaira ?? 100;
  const maximum = config?.maxTopUpNaira ?? 500000;
  const wallet = useQuery(api.wallet.balance, {});
  const currentBalance = wallet?.balanceNaira;
  const presets = (config?.topUpPresetsNaira ?? []).filter(value => value >= minimum && value <= maximum);
  const [amount, setAmount] = useState("");
  const edited = useRef(false);
  const inFlight = useRef(false);
  const [screen, setScreen] = useState<"amount" | "checkout" | "pending" | "error" | "success">("amount");
  const [action, setAction] = useState<"starting" | "opening" | "checking" | null>(null);
  const busy = action !== null;
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("We couldn't start your deposit");
  const [startAgain, setStartAgain] = useState(false);
  const [savedOnDevice, setSavedOnDevice] = useState(false);
  const [payment, setPayment] = useState<{ reference: string; url: string; amount: number } | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [showReference, setShowReference] = useState(false);
  const storageKey = `passenger.pendingDeposit.${snapshot?.viewer?.id ?? "guest"}`;
  const parsedAmount = parseDepositAmount(amount, minimum, maximum);
  const shortfall = minRequiredAmount !== undefined && currentBalance !== undefined ? Math.max(0, minRequiredAmount - currentBalance) : 0;

  useEffect(() => {
    if (!edited.current && currentBalance !== undefined) setAmount(String(suggestedDeposit(currentBalance, minRequiredAmount, config?.defaultTopUpNaira ?? 5000, minimum, maximum)));
  }, [currentBalance, minRequiredAmount, config?.defaultTopUpNaira, minimum, maximum]);

  useEffect(() => {
    let active = true;
    setRestoring(true);
    void (async () => {
      try {
        const raw = Platform.OS === "web" ? localStorage.getItem(storageKey) : await SecureStore.getItemAsync(storageKey);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (active && saved && typeof saved === "object" && "reference" in saved && typeof saved.reference === "string" && "url" in saved && typeof saved.url === "string" && /^https:\/\//i.test(saved.url) && "amount" in saved && typeof saved.amount === "number" && Number.isSafeInteger(saved.amount) && saved.amount > 0) {
          setPayment({ reference: saved.reference, url: saved.url, amount: saved.amount });
          setScreen("checkout");
          setSavedOnDevice(true);
        }
      } catch { /* Storage failure must not block access to the wallet. */ }
      finally { if (active) setRestoring(false); }
    })();
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (pendingDeposit && !restoring) {
      setPayment(pendingDeposit);
      setSavedOnDevice(true);
      setScreen(pendingDeposit.url ? "checkout" : "pending");
    }
  }, [pendingDeposit?.reference, pendingDeposit?.url, restoring]);

  const persist = async (value: typeof payment) => {
    try {
      if (Platform.OS === "web") {
        if (value) localStorage.setItem(storageKey, JSON.stringify(value));
        else localStorage.removeItem(storageKey);
      } else if (value) await SecureStore.setItemAsync(storageKey, JSON.stringify(value));
      else await SecureStore.deleteItemAsync(storageKey);
      setSavedOnDevice(!!value);
    } catch { setSavedOnDevice(false); }
  };
  const finish = async (balance: number) => {
    setNewBalance(balance);
    await persist(null);
    setScreen("success");
  };
  const close = () => { if (!inFlight.current) onClose(); };
  const done = () => { onSuccess?.(); onClose(); };
  const openCheckout = async (url: string) => {
    if (inFlight.current || offline) return;
    inFlight.current = true; setAction("opening"); setError("");
    setErrorTitle("The payment page couldn't open");
    try { await Linking.openURL(url); setScreen("checkout"); }
    catch (cause) { setError(errorMessage(cause, "The payment page couldn't open. Try opening it again.")); setScreen("error"); }
    finally { inFlight.current = false; setAction(null); }
  };
  const initialize = async () => {
    if (parsedAmount === null || offline || inFlight.current || payment) return;
    Keyboard.dismiss();
    inFlight.current = true; setAction("starting"); setError("");
    setErrorTitle("We couldn't start your deposit");
    try {
      const result = await topUpWallet(parsedAmount);
      {
        const pending = { reference: result.reference, url: result.url, amount: parsedAmount };
        setPayment(pending);
        await persist(pending);
        setScreen("checkout");
        setAction("opening");
        // Keep the reference before handing off to another app or browser tab.
        setErrorTitle("The payment page couldn't open");
        try {
          await Linking.openURL(result.url);
        } catch {
          throw new Error("Unable to open the checkout page on this device. Please check your browser settings.");
        }
      }
    } catch (cause) { setError(errorMessage(cause)); setScreen("error"); }
    finally { inFlight.current = false; setAction(null); }
  };
  const verify = async () => {
    if (!payment || inFlight.current || offline) return;
    inFlight.current = true; setAction("checking"); setError("");
    setErrorTitle("We couldn't check your payment");
    try {
      const result = await verifyWalletTopUp(payment.reference);
      if (result.success) await finish(result.balanceNaira);
      else setScreen("pending");
    } catch (cause) { setError(errorMessage(cause, "We couldn't check your payment. Your deposit has not been confirmed yet.")); setScreen("error"); }
    finally { inFlight.current = false; setAction(null); }
  };

  // Returning from checkout triggers verification, never local payment success.
  const verifyOnReturn = useRef(verify);
  verifyOnReturn.current = verify;
  useEffect(() => {
    if (!payment || screen === "success") return;
    const check = () => { void verifyOnReturn.current(); };
    const subscription = AppState.addEventListener("change", state => { if (state === "active") check(); });
    const visible = () => { if (document.visibilityState === "visible") check(); };
    if (Platform.OS === "web") {
      window.addEventListener("focus", check);
      document.addEventListener("visibilitychange", visible);
    }
    return () => {
      subscription.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("focus", check);
        document.removeEventListener("visibilitychange", visible);
      }
    };
  }, [payment?.reference, screen === "success"]);

  if (startAgain) return <FullScreenState title="Start a different deposit?" subtitle="Check the existing payment first. A new amount is available only after Paystack confirms that checkout failed or was abandoned." primaryAction={{ label: "Keep this payment", onPress: () => setStartAgain(false) }} secondaryAction={{ label: "I haven't paid. Start again", onPress: () => { void persist(null); setPayment(null); setScreen("amount"); setStartAgain(false); setShowReference(false); setError(""); } }} onRequestClose={() => setStartAgain(false)} />;

  if (screen === "success") return <FullScreenState title="Money added to your wallet" subtitle={`Your balance is now ${money(newBalance ?? 0)}. You're ready to pay for deliveries.`} primaryAction={{ label: "Done", onPress: done }} onRequestClose={done} />;

  const sheetStyle = { width: "100%" as const, maxWidth: 580, alignSelf: "center" as const };

  if (restoring) return <PresentationSheet title="Add money" onClose={close} containerStyle={sheetStyle}><ContentSkeleton rows={1} /></PresentationSheet>;

  if (screen === "amount") return <PresentationSheet title="Add money" onClose={close} containerStyle={sheetStyle} footer={<Button title={busy ? "Opening checkout…" : parsedAmount !== null ? `Continue with ${money(parsedAmount)}` : "Continue to payment"} variant="lime" busy={busy} disabled={parsedAmount === null || offline || restoring || currentBalance === undefined || pendingDeposit === undefined || wallet?.blocked} onPress={() => void initialize()} />}>
    <View style={{ gap: 16 }}>
      <Txt style={s.muted}>{currentBalance === undefined ? "Loading balance…" : `Wallet balance ${money(currentBalance)}`}</Txt>
      {shortfall > 0 && <Notice>Add at least {money(shortfall)} to cover this parcel.</Notice>}
      <Field label="Amount (₦)" value={amount} onChangeText={value => { edited.current = true; setAmount(value); }} keyboardType="number-pad" placeholder="5000" maxLength={12} editable={!restoring && !busy} style={w.amountInput} />
      {!!presets.length && <View style={s.wrap}>{presets.map(preset => <Pressable key={preset} accessibilityRole="radio" accessibilityLabel={money(preset)} accessibilityState={{ checked: parsedAmount === preset, disabled: restoring || busy }} disabled={restoring || busy} onPress={() => { edited.current = true; setAmount(String(preset)); }} style={({ pressed }) => [w.presetButton, parsedAmount === preset && w.presetButtonActive, (pressed || busy) && w.controlDimmed]}><Txt style={[w.presetText, parsedAmount === preset && w.presetTextActive]}>{money(preset)}</Txt></Pressable>)}</View>}
      {amount.trim() !== "" && parsedAmount === null ? <Txt accessibilityRole="alert" style={s.hint}>Enter a whole-naira amount between {money(minimum)} and {money(maximum)}.</Txt> : <Txt style={s.hint}>Secure checkout with Paystack.</Txt>}
      {wallet?.blocked && <Notice tone="warning">Your wallet is under payment review. Contact support.</Notice>}
      {offline && <Notice tone="warning">Reconnect to add money.</Notice>}
    </View>
  </PresentationSheet>;

  const title = screen === "error" ? errorTitle : screen === "pending" ? "Awaiting payment" : "Complete payment";
  const description = screen === "error" ? error : screen === "pending" ? "Your payment isn't confirmed yet. If you've paid, wait a moment and check again." : "Complete payment with Paystack. We’ll check it when you return.";
  return <PresentationSheet title={title} onClose={close} containerStyle={sheetStyle} footer={<View style={{ gap: 8 }}>
    {payment ? <>
      <Button title={action === "checking" ? "Checking payment…" : screen === "pending" ? "Check again" : "Check payment"} variant="lime" busy={action === "checking"} disabled={busy || offline} onPress={() => void verify()} />
      {!!payment.url && <Button title={action === "opening" ? "Opening checkout…" : "Return to checkout"} variant="ghost" busy={action === "opening"} disabled={busy || offline} onPress={() => void openCheckout(payment.url)} />}
    </> : <Button title="Try again" variant="lime" onPress={() => { setError(""); setScreen("amount"); }} />}
  </View>}>
    <View style={{ gap: 20 }}>
      <View style={w.depositSummary}>
        <Txt style={s.muted}>Deposit amount</Txt>
        <Txt style={w.depositAmount}>{money(payment?.amount ?? parsedAmount ?? 0)}</Txt>
      </View>
      <Txt style={w.depositBody}>{description}</Txt>
      {payment && <>
        <Txt style={s.hint}>{savedOnDevice ? "You can close this and check again from your wallet." : "Keep this open or save your payment reference before leaving."}</Txt>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showReference || !savedOnDevice }} onPress={() => setShowReference(!showReference)} disabled={!savedOnDevice} style={({ pressed }) => [w.detailsToggle, pressed && w.controlDimmed]}><Txt style={w.detailsLabel}>Payment details</Txt>{savedOnDevice && (showReference ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />)}</Pressable>
        {(showReference || !savedOnDevice) && <View style={w.paymentDetails}>
          <Txt style={s.hint}>Payment reference</Txt>
          <Txt selectable style={s.hint}>{payment.reference}</Txt>
          <Button title="Use a different amount" small variant="ghost" disabled={busy} onPress={() => setStartAgain(true)} />
        </View>}
      </>}
      {offline && <Notice tone="warning">Reconnect to check your payment.</Notice>}
    </View>
  </PresentationSheet>;
}

export function WalletTransactionHistory() {
  const { results: transactions, status, loadMore } = usePaginatedQuery(api.wallet.transactionsPage, {}, { initialNumItems: 20 });

  if (status === "LoadingFirstPage") return <ContentSkeleton rows={3} />;
  if (transactions.length === 0) {
    return (
      <View style={w.emptyActivity}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={w.emptyActivityIcon}>
          <ReceiptText size={28} color={colors.forest} strokeWidth={1.6} />
        </View>
        <Txt style={w.emptyActivityTitle}>No activity yet</Txt>
        <Txt style={w.emptyActivityDetail}>
          Your deposits, parcel payments and refunds will appear here, so you can keep track of your money.
        </Txt>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {transactions.map((t) => (
        <TransactionRow key={t.id} transaction={t} />
      ))}
      {status !== "Exhausted" ? <Button title={status === "LoadingMore" ? "Loading earlier activity" : "Load earlier activity"} variant="ghost" busy={status === "LoadingMore"} disabled={status === "LoadingMore"} onPress={() => loadMore(20)} /> : null}
    </View>
  );
}

const TransactionRow = memo(function TransactionRow({ transaction: t }: { transaction: WalletTransaction }) {
  const isCredit = t.kind === "top_up" || t.kind === "parcel_refund" || t.kind === "payout";

  const kindLabel = {
    top_up: "Wallet funded",
    parcel_hold: "Held for parcel",
    parcel_refund: "Fee refunded",
    payout: "Traveller payout",
  }[t.kind];

  return (
    <View style={w.txnRow}>
      <View style={[s.row, { gap: 10, alignItems: "center", flex: 1 }]}>
        <View
          style={[
            w.txnIconShell,
            { backgroundColor: isCredit ? "#EAF3DD" : "#F8F1E7" },
          ]}
        >
          {isCredit ? (
            <ArrowDownLeft size={16} color={colors.forest} />
          ) : (
            <ArrowUpRight size={16} color="#8B6B3D" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={w.txnTitle}>{kindLabel}</Txt>
          <Txt style={w.txnSubtitle} numberOfLines={1}>
            {t.note || shortDate(t.createdAt)}
          </Txt>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Txt
          style={[
            w.txnAmount,
            { color: isCredit ? colors.forest : semantic.color.text.primary },
          ]}
        >
          {isCredit ? `+${money(t.amountNaira)}` : `-${money(t.amountNaira)}`}
        </Txt>
        <Txt style={w.txnDate}>{shortDate(t.createdAt)}</Txt>
      </View>
    </View>
  );
});

export function WalletSection() {
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <Card>
      <SectionTitle
        title="Wallet"
        subtitle="Add money and view your activity."
      />
      <WalletBalanceCard onTopUp={() => setTopUpOpen(true)} />
      <View style={{ marginTop: 18 }}>
        <Txt style={[s.h3, { marginBottom: 10 }]}>Recent activity</Txt>
        <WalletTransactionHistory />
      </View>
      {topUpOpen && (
        <TopUpSheet onClose={() => setTopUpOpen(false)} />
      )}
    </Card>
  );
}

const w = StyleSheet.create({
  depositBody: { fontSize: 15, lineHeight: 23, color: colors.muted },
  amountInput: { fontFamily: fontFamily.medium, fontSize: 32, lineHeight: 40, minHeight: 76, paddingVertical: 16 },
  detailsToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
  controlDimmed: { opacity: 0.55 },
  detailsLabel: { fontSize: 14, fontFamily: fontFamily.medium, color: colors.forest },
  paymentDetails: { padding: 16, borderRadius: 16, backgroundColor: colors.soft, gap: 10 },
  depositSummary: { paddingVertical: 12, gap: 8 },
  depositAmount: { fontFamily: fontFamily.medium, fontSize: 40, lineHeight: 48, color: colors.text },
  emptyActivity: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 10,
  },
  emptyActivityIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#EAF3DD",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyActivityTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: semantic.color.text.primary,
    textAlign: "center",
  },
  emptyActivityDetail: {
    fontSize: 13,
    lineHeight: 20,
    color: semantic.color.text.secondary,
    textAlign: "center",
    maxWidth: 280,
  },
  card: {
    backgroundColor: "#F7FAF2",
    borderColor: "#DEE8D3",
    borderWidth: 1,
    borderRadius: primitives.radius.lg,
    padding: primitives.space[4],
  },
  iconShell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#E4EFD8",
    justifyContent: "center",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: semantic.color.text.tertiary,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.forest,
    marginTop: 2,
  },
  balanceSub: {
    fontSize: 11,
    color: semantic.color.text.tertiary,
    flex: 1,
    lineHeight: 16,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: primitives.radius.md,
    backgroundColor: semantic.color.background.subtle,
    borderWidth: 1,
    borderColor: "transparent",
  },
  presetButtonActive: {
    backgroundColor: colors.soft,
    borderColor: colors.forest,
  },
  presetText: {
    fontSize: 12,
    fontWeight: "600",
    color: semantic.color.text.primary,
  },
  presetTextActive: {
    color: colors.forest,
  },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: primitives.space[4],
    paddingVertical: primitives.space[4],
    gap: primitives.space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  txnIconShell: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  txnTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: semantic.color.text.primary,
  },
  txnSubtitle: {
    fontSize: 11,
    color: semantic.color.text.tertiary,
    marginTop: 2,
  },
  txnAmount: {
    fontSize: 13,
    fontWeight: "700",
  },
  txnDate: {
    fontSize: 10,
    color: semantic.color.text.tertiary,
    marginTop: 2,
  },
});
