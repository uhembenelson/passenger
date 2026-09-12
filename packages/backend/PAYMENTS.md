# Paystack setup

Wallet deposits use Paystack hosted checkout in NGN. The server saves the account and exact amount before opening checkout. A verified transaction or a signed webhook credits that deposit once. Returning to the app triggers a status check; returning alone never credits money. Missing keys disable deposits.

Set `PAYSTACK_SECRET_KEY` in the target Convex deployment's environment settings. Start with a Paystack test secret, then switch to the live secret after testing. No public key is needed for this hosted checkout flow. Never put the secret in mobile, website, or shared public environment files.

Register `https://YOUR_DEPLOYMENT.convex.site/paystack/webhook` as the webhook URL in the Paystack dashboard for the matching test or live environment. Use the deployment's HTTP `.convex.site` address.

Optionally set `PAYSTACK_CALLBACK_URL` to the application's HTTPS return URL. If omitted, Paystack uses its default completion page. The user can return to Passenger to check the payment.

Deploy the backend changes, including the `walletDeposits` table, before releasing the mobile changes. Test a successful deposit, a cancelled checkout, returning to the app, and a repeated webhook. The balance must increase exactly once, and cancelled or pending payments must not add money.

Deposits created before this change have no saved deposit record and cannot be automatically credited by the new flow. Review any outstanding older references in Paystack before rollout. Do not recreate a credit from client-supplied ownership or metadata.

The implementation can be tested with mocked provider responses without credentials. A real Paystack test checkout and live activation still require the deployment key and webhook configuration.
