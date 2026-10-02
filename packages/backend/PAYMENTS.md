# Payment and banking provider setup

Use a separate Convex deployment for Paystack test keys and live keys. Set `PAYSTACK_SECRET_KEY` only in that deployment's environment settings. No public key is needed for hosted checkout. Wallets and holds retain their test/live mode; test funds cannot fund live payouts.

Register `https://YOUR_DEPLOYMENT.convex.site/paystack/webhook` in the matching Paystack environment. Optional `PAYSTACK_CALLBACK_URL` must be an HTTPS application URL. A return visit triggers verification; it never credits money by itself.

## Deposits and checkout recovery

The backend saves the account, amount in kobo, mode and random reference before calling Paystack. Only one pending deposit is allowed per wallet. Concurrent requests and retries reuse its saved checkout. The mobile wallet restores it from the server even if local storage was lost.

If initialization times out before the checkout URL is saved, the reference remains pending. The backend does not assume that the charge failed or create a second checkout. Verification must confirm failure or abandonment before a different checkout can start. A reference Paystack cannot verify remains an operator reconciliation case.

Credits require the saved owner, exact amount, NGN currency and provider transaction ID. Wallet credits and their ledger records commit atomically and reject duplicate transaction IDs. Signed success webhooks and authenticated verification use the same settlement mutation.

## Wallet holds, payouts and refunds

Only `walletVerifiedBalanceNaira` is spendable. A parcel hold deducts verified funds and creates a payment record with `source: wallet`. Parcel edits adjust the remaining hold atomically. Cancellation and approved wallet refunds return only the remaining held amount; they cannot refund money with a prepared or active payout.

Wallet-funded traveller payouts use only the v4 banking API. Existing Paystack recipient records must be reverified through v4 before payout. The flow retains the delivery, 24-hour wait, dispute, verified-bank and identity checks. Dispatch checks the source wallet again for a freeze or suspension. Prepared operations are claimed once, and uncertain transfers retain their references. Returning money to a wallet does not call Paystack's card-refund API.

## V4 bank verification and payouts

Set `V4_VERIFICATION_API_KEY`, `V4_VERIFICATION_API_SECRET`, `V4_API_URL`, and `V4_BANK_ACCOUNT_ENCRYPTION_KEY` in the Convex deployment environment. The API URL is the root ending in `/api/v4`; when it is omitted, Passenger derives it from `V4_VERIFICATION_API_URL` by removing the trailing `/verifications` segment.

The encryption key must be an independent stable random value of at least 32 characters. Passenger stores only the last four digits for display and an AES-GCM encrypted account number for transfer submission. Changing or losing this key requires travellers to reverify their bank accounts.

Passenger uses the v4 endpoints to list banks, verify an account, and retain the returned `nameEnquiryReference`. Payout submission uses the saved server-calculated traveller amount and the Passenger payout reference as `Idempotency-Key`. Reconciliation repeats the same request body and key, allowing the v4 service to return the original result without creating another transfer.

The external v4 server must separately configure `V4_TRANSFERS_ENABLED=true`, its debit account, provider OTP when required, Redis, its own rate limits, and a matching `V4_TRANSFER_TRANSACTION_PIN`. Passenger never initiates a transfer automatically: eligible delivery earnings are released to the traveller's Passenger balance, and a withdrawal requires an amount within that balance plus the traveller's transaction PIN. The server-only `V4_TRANSFER_TRANSACTION_PIN` is sent only from the Convex action to the private v4 gateway; it is never exposed to the client. These values do not belong in any public client environment.

A payment already dispatched to Paystack cannot be recalled by a later wallet freeze. The system records a risk alert so finance can reconcile that exposure.

## Provider disputes and reversals

Signed dispute events freeze the wallet and undispatched payouts. A late success cannot remove a freeze. Scheduled verification checks credited transactions for disputes, including missed webhooks.

Provider refunds are fetched independently by refund ID. Each processed refund is recorded once in `walletReversals`, and only its confirmed amount is deducted. A full reversal deducts the remaining amount, without duplicating earlier partial refunds. A spent reversal may create a negative verified balance. The wallet remains frozen and the negative amount remains debt; it is not replaced with zero in the stored ledger.

Administrators can call `wallet.reviewDispute` with a reference and review note. The action independently verifies that the deposit remains paid and all provider disputes are resolved and declined before clearing that deposit's dispute hold. It rejects changed risk state, reversals and debt. It does not clear other deposit holds. Refund losses, debt, and old funds require finance reconciliation; there is no balance-reset or manual credit endpoint.

## Reconciliation and alerts

Every five minutes, scheduled jobs check pending deposits and outgoing operations. Paid deposits are checked daily, including their transaction disputes. Hourly refund reconciliation walks the provider's paginated refund list. Paystack operations use provider verification endpoints; v4 transfers repeat only the same idempotent request with the same body and key.

Unresolved deposits and operations raise a durable alert after 15 minutes. Failed reconciliation and risk events also raise alerts. `wallet.alerts` is administrator-only. New alerts write an audit event and an in-app notification for configured `ADMIN_CLERK_SUBJECTS`; configure these actual administrator subjects before launch. No external email or Slack alert is sent.

Payment initialization, verification, bank lookup/setup, finance reconciliation and new finance operations have per-user server rate limits of 10 requests per minute per category.

## Rollout

Deploy the schema and backend before the mobile changes. Existing balances may contain the former simulated credits, so they are not automatically copied into the verified balance. Existing wallet holds without verified funding records are blocked from automatic payout. Review older funds against Paystack transaction records and the wallet ledger through a separately reviewed migration. Never mark an old balance verified merely because it exists.

Run the payment tests, then exercise successful and abandoned checkouts, webhook replay, interrupted initialization, partial refunds, disputes and transfers with Paystack test credentials. Exercise bank listing, account verification, idempotent transfer replay, disabled transfers, Redis failure and provider OTP behavior against a non-production v4 server. Live activation still requires actual provider credentials, webhook configuration, operator review of alerts and a separate live deployment. Automated tests use mocked provider responses and do not prove provider-account configuration.

Provider payloads and endpoints were checked against Paystack's published OpenAPI schema at https://github.com/PaystackOSS/openapi/blob/main/dist/paystack.yaml.
