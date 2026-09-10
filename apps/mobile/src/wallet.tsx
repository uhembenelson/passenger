import React, { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import { Wallet, ArrowDownLeft, ArrowUpRight, CheckCircle2, ShieldCheck } from "lucide-react-native";
import { primitives, semantic } from "@passenger/design-tokens";
import { money } from "@passenger/core";
import type { WalletTransaction } from "@passenger/core";
import { usePassenger } from "./data";
import { Button, Card, colors, errorMessage, Field, fontFamily, Notice, PresentationSheet, s, SectionTitle, Sheet, shortDate, Txt } from "./ui";

const PRESET_AMOUNTS = [2000, 5000, 10000, 20000, 50000];

export function WalletBalanceCard({ onTopUp }: { onTopUp: () => void }) {
  const { snapshot } = usePassenger();
  const balance = snapshot?.viewer?.walletBalanceNaira ?? 0;

  return (
    <Card style={w.card}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
        <View style={[s.row, { gap: 10, alignItems: "center" }]}>
          <View style={w.iconShell}>
            <Wallet size={20} color={colors.forest} strokeWidth={2} />
          </View>
          <View>
            <Txt style={w.balanceLabel}>PASSENGER WALLET</Txt>
            <Txt style={w.balanceAmount}>{money(balance)}</Txt>
          </View>
        </View>
        <Button title="Top up" small variant="lime" onPress={onTopUp} />
      </View>
      <View style={[s.row, { gap: 6, marginTop: 12, alignItems: "center" }]}>
        <ShieldCheck size={14} color={semantic.color.text.tertiary} />
        <Txt style={w.balanceSub}>
          Funds are held safely in escrow during parcel delivery and refunded on cancellation.
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
  const currentBalance = snapshot?.viewer?.walletBalanceNaira ?? 0;
  const initialAmount = minRequiredAmount && minRequiredAmount > currentBalance
    ? Math.ceil((minRequiredAmount - currentBalance) / 1000) * 1000
    : 5000;

  const [amount, setAmount] = useState(String(Math.max(1000, initialAmount)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeReference, setActiveReference] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const parsedAmount = parseInt(amount, 10);
  const isValidAmount = Number.isSafeInteger(parsedAmount) && parsedAmount >= 100 && parsedAmount <= 500000;

  const handleInitialize = async () => {
    if (!isValidAmount || offline || busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await topUpWallet(parsedAmount);
      setActiveReference(result.reference);
      if (result.mode === "provider") {
        setCheckoutUrl(result.url);
      } else {
        setCheckoutUrl(null);
        setVerified(true);
        setNewBalance(result.balanceNaira);
        if (onSuccess) onSuccess();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!activeReference || verifying) return;
    setError("");
    setVerifying(true);
    try {
      const result = await verifyWalletTopUp(activeReference);
      if (result.success) {
        setVerified(true);
        setNewBalance(result.balanceNaira);
        if (onSuccess) onSuccess();
      } else {
        setError("Payment not yet confirmed by Paystack. If you just completed it, wait a moment and try verifying again.");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <PresentationSheet
      title={verified ? "Wallet funded!" : "Top up wallet"}
      onClose={onClose}
    >
      {verified ? (
        <View style={{ gap: 16, alignItems: "center", paddingVertical: 18 }}>
          <CheckCircle2 size={48} color={colors.forest} />
          <Txt style={s.h2}>Top-up confirmed</Txt>
          <Txt style={[s.muted, { textAlign: "center" }]}>
            Your wallet balance has been updated to {money(newBalance ?? (currentBalance + parsedAmount))}.
          </Txt>
          <Button title="Done" variant="lime" onPress={onClose} style={{ width: "100%", marginTop: 12 }} />
        </View>
      ) : activeReference ? (
        <View style={{ gap: 16 }}>
          <Notice tone="neutral">
            Paystack checkout was opened in your browser. Complete the payment, then tap "Confirm payment" below.
          </Notice>
          <Card>
            <Txt style={s.label}>Amount being added</Txt>
            <Txt style={[s.h2, { color: colors.forest, marginVertical: 4 }]}>
              {money(parsedAmount)}
            </Txt>
            <Txt style={[s.hint, { fontSize: 11 }]}>Reference: {activeReference}</Txt>
          </Card>
          {error !== "" && <Notice tone="error">{error}</Notice>}
          <Button
            title="Confirm payment"
            variant="lime"
            busy={verifying}
            disabled={verifying}
            onPress={handleVerify}
          />
          <Button
            title="Re-open checkout link"
            variant="secondary"
            disabled={verifying || !checkoutUrl}
            onPress={async () => {
              if (!checkoutUrl) return;
              setError("");
              try {
                await Linking.openURL(checkoutUrl);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 18 }}>
          <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
            <Txt style={s.label}>Current balance</Txt>
            <Txt style={{ fontWeight: "700", color: colors.forest }}>{money(currentBalance)}</Txt>
          </View>

          {minRequiredAmount && minRequiredAmount > currentBalance && (
            <Notice tone="warning">
              You need at least {money(minRequiredAmount)} to post this parcel. Add at least {money(minRequiredAmount - currentBalance)}.
            </Notice>
          )}

          <View style={{ gap: 8 }}>
            <Txt style={s.label}>Quick select amount</Txt>
            <View style={s.wrap}>
              {PRESET_AMOUNTS.map((preset) => (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  onPress={() => setAmount(String(preset))}
                  style={[
                    w.presetButton,
                    parsedAmount === preset && w.presetButtonActive,
                  ]}
                >
                  <Txt
                    style={[
                      w.presetText,
                      parsedAmount === preset && w.presetTextActive,
                    ]}
                  >
                    {money(preset)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </View>

          <Field
            label="Top-up amount (₦)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="5000"
            hint="Minimum ₦100 · Maximum ₦500,000"
          />

          {error !== "" && <Notice tone="error">{error}</Notice>}

          <Button
            title={busy ? "Funding wallet…" : `Add ${isValidAmount ? money(parsedAmount) : ""} to wallet`}
            variant="lime"
            busy={busy}
            disabled={!isValidAmount || offline || busy}
            onPress={handleInitialize}
          />

          <Txt style={[s.hint, { textAlign: "center" }]}>
            Passenger will either open the configured payment provider or, when payments are not set up yet, apply the temporary in-app funding flow for this build.
          </Txt>
        </View>
      )}
    </PresentationSheet>
  );
}

export function WalletTransactionHistory() {
  const { snapshot } = usePassenger();
  const transactions = snapshot?.walletTransactions ?? [];

  if (transactions.length === 0) {
    return (
      <View style={{ paddingVertical: 14 }}>
        <Txt style={[s.muted, { fontSize: 12, textAlign: "center" }]}>
          No wallet transactions yet. Funds added or held for parcels will show here.
        </Txt>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {transactions.map((t) => (
        <TransactionRow key={t.id} transaction={t} />
      ))}
    </View>
  );
}

function TransactionRow({ transaction: t }: { transaction: WalletTransaction }) {
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
}

export function WalletSection() {
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <Card>
      <SectionTitle
        title="In-app wallet & escrow"
        subtitle="Post parcels seamlessly. Fees are held in escrow and released only upon confirmed delivery."
      />
      <WalletBalanceCard onTopUp={() => setTopUpOpen(true)} />
      <View style={{ marginTop: 18 }}>
        <Txt style={[s.eyebrow, { marginBottom: 10 }]}>RECENT ACTIVITY</Txt>
        <WalletTransactionHistory />
      </View>
      {topUpOpen && (
        <TopUpSheet onClose={() => setTopUpOpen(false)} />
      )}
    </Card>
  );
}

const w = StyleSheet.create({
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
    fontSize: 9,
    fontFamily: fontFamily.medium,
    letterSpacing: 1.2,
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
    paddingVertical: 8,
    borderRadius: primitives.radius.md,
    backgroundColor: semantic.color.background.subtle,
    borderWidth: 1,
    borderColor: "transparent",
  },
  presetButtonActive: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  presetText: {
    fontSize: 12,
    fontWeight: "600",
    color: semantic.color.text.primary,
  },
  presetTextActive: {
    color: "white",
  },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
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
