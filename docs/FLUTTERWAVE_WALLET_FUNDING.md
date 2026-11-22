# Flutterwave wallet funding and KYC deployment

TolirexData uses Flutterwave permanent NGN virtual accounts for wallet funding. Topupmate remains the service and virtual-card supplier; Flutterwave is the wallet collection provider.

## Deployment prerequisites

1. Confirm the Supabase project reference is `swjojapsfbzxnfvclsui`.
2. Apply the migrations in timestamp order, including:
   - `20261122100000_flutterwave_virtual_accounts_wallet_funding.sql`
   - `20261122110000_account_type_workspace_provisioning.sql`
   - `20261122120000_retire_legacy_manual_funding.sql`
3. Configure Supabase Edge Function secrets. Never put these in Vite variables or the repository:
   - `FLW_SECRET_KEY`: Flutterwave live secret key.
   - `FLW_SECRET_HASH`: the webhook secret hash configured in Flutterwave.
   - `KYC_ENCRYPTION_KEY`: base64 encoding of exactly 32 cryptographically random bytes for AES-256-GCM KYC encryption.
4. Ensure GitHub Actions has `SUPABASE_ACCESS_TOKEN` to deploy Edge Functions.
5. Configure the Flutterwave webhook URL:
   `https://swjojapsfbzxnfvclsui.supabase.co/functions/v1/flutterwave-webhook`
6. Enable `charge.completed` / bank-transfer notifications and webhook retries in Flutterwave.

## Customer flow

1. A customer chooses Personal, Agent/Reseller or Business at signup.
2. Agent and Business workspace records are created with pending approval status.
3. Customer signs in and submits KYC using BVN or NIN with explicit consent.
4. The KYC Edge Function encrypts the identity value before storing it.
5. A Compliance Admin reviews the submission. Approval synchronizes the KYC level to the profile.
6. The customer requests a permanent Flutterwave account. The Edge Function decrypts the approved identity server-side and calls Flutterwave's NGN static virtual-account endpoint.
7. Flutterwave returns the account number and bank name; only the account details and provider references are stored for dashboard display.
8. When a transfer arrives, Flutterwave calls the webhook. The webhook checks `verif-hash`, verifies the transaction directly with Flutterwave, resolves the customer's permanent account reference, records a funding event and calls the service-role-only idempotent wallet settlement RPC.
9. Settlement posts a balanced journal, credits the wallet balance projection and records wallet activity. Duplicate webhook delivery must not credit twice.

## Operational safety

- Never manually approve a customer deposit claim. New deposits are credited only from verified Flutterwave events.
- Do not retry virtual-account creation blindly after an ambiguous network timeout. Investigate the provider account first to avoid issuing duplicate accounts.
- A verified payment whose ledger settlement fails remains recorded for reconciliation; do not create a second payment or credit manually without an audited reconciliation procedure.
- Keep the old `fundings` table for historical records only. The legacy manual funding RPCs are retired by migration.
- Test in a controlled Flutterwave environment before enabling live customer transfers. Confirm merchant virtual-account access, settlement, webhook delivery and bank transfer timing.
- Never log or expose BVN/NIN, the KYC ciphertext, Flutterwave secrets, full raw webhook payloads, or unmasked card data.

## Important launch gate

The code and migrations do not configure Flutterwave merchant access or Supabase secrets by themselves. Do not announce live funding until migrations are applied, the Edge Functions are deployed, webhook verification succeeds, and an end-to-end transfer has been reconciled against the ledger.
