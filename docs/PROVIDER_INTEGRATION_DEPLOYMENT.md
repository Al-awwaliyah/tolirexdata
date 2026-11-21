# TolirexData Topupmate integration and deployment

## Active supplier
TolirexData uses Topupmate as its launch bill-payment and digital-services supplier. ClubKonnect has been retired from the active architecture; the deployment workflow deletes the legacy ClubKonnect sync function and removes old ClubKonnect credentials if present.

## Edge Functions
- `topupmate-sync-catalogue`: administrator-only live catalogue sync, including networks, data plans, cable packages/providers, electricity operators, education PINs, recharge PINs, Data PINs, Internet bundles and gift-card denominations.
- `purchase-airtime-data`: Airtime and Data purchases with supplier-derived pricing, persistent reference, wallet reservation, and same-reference status reconciliation.
- `topupmate-expanded-services`: Cable TV, Electricity, Recharge PINs, Data PINs, Education PINs, Internet and Gift Card verify/purchase/status flows.
- `topupmate-virtual-cards`: KYC-gated virtual card creation and authenticated card lifecycle actions.
- `submit-kyc`, `review-kyc`, `admin-console`: KYC and protected administration.

## Required Supabase Edge Function secrets
Set only credentials and cryptographic keys as secrets:
- `TOPUPMATE_API_KEY`: Topupmate API token.
- `TOPUPMATE_BASE_URL`: optional; defaults to `https://connect.topupmate.com/api`. Use the sandbox URL only for sandbox testing.
- `KYC_ENCRYPTION_KEY`: 32-byte base64 AES-GCM key for encrypted BVN/NIN data.
- Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` runtime values.

Do not save card creation fees, card minimum funding, creation markup, card top-up minimum or funding markup as secrets. These are configured in Admin → Virtual Cards and stored in the audited `topupmate_card_pricing` table. Finance Admin and Super Admin can change them. The deployment workflow removes any legacy `TOPUPMATE_CARD_*` pricing secrets.

## Catalogue workflow
1. Apply the pending Supabase migrations in repository order.
2. Configure `TOPUPMATE_API_KEY` and `KYC_ENCRYPTION_KEY` in Supabase Edge Function secrets.
3. Deployments are triggered automatically by pushes to `feat/tolirexdata-platform-foundation`.
4. In Admin → Providers, keep Topupmate disabled until the supplier credentials and sync are verified.
5. In Admin → Service Catalogue, run Topupmate sync. Supplier products/options are imported as private pending records.
6. Review provider options and product costs, set Personal/Agent/Business prices and publish. Only published records from an enabled provider appear in the customer catalogue.

## Service purchase safety
- Cable TV and electricity meter details are verified with Topupmate before wallet debit.
- Wallet charge is calculated server-side from the selected published product, supplier cost and active account pricing rule. The client never supplies supplier cost or payable amount.
- Each purchase receives one persistent request reference before supplier submission.
- Only an explicit supplier success settles the order. Only an explicit supplier failure triggers an idempotent refund.
- Timeout, HTTP errors or unrecognized statuses remain unknown/processing. Reconciliation queries the same reference; never issue a second purchase or automatic refund while the result is uncertain.
- PINs and gift-card redemption values are returned only to the authenticated owner and are never written to logs.

## Virtual-card pricing and controls
Admin → Virtual Cards controls:
- Card creation enabled/disabled.
- Topupmate creation fee (USD).
- Minimum initial funding (USD).
- TolirexData card creation markup (USD).
- Minimum card top-up (USD).
- Card top-up markup (%).

Each update is permission-checked and written to the audit log. The Edge Function reads the current database settings when quoting or reserving a card operation. API keys and KYC encryption keys remain server secrets.

## Deployment
GitHub Actions automatically deploys every Edge Function from the feature branch after relevant source changes. The workflow also removes the retired ClubKonnect function and unsets obsolete ClubKonnect/card-pricing secrets. It does not apply database migrations automatically; apply each pending migration once, in order, before using the new database-backed features.

## Current launch gates
- Confirm Topupmate sandbox and live API credentials.
- Run a complete sync and verify actual supplier responses, product IDs and prices.
- Publish only products/options that have been checked.
- Test every purchase and card lifecycle operation in sandbox.
- Verify ledger balances, failure refunds, uncertain outcomes and transaction reconciliation before enabling real-money traffic.
