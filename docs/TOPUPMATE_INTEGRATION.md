# TolirexData Topupmate Integration

Topupmate is the launch VTU provider. All provider calls run from Supabase Edge Functions; the API key is never exposed to browser code.

## API configuration

Set Supabase Edge Function secrets:
- `TOPUPMATE_API_KEY`: secret from the Topupmate account.
- `TOPUPMATE_BASE_URL`: optional; defaults to `https://connect.topupmate.com/api`. Use `https://connect.topupmate.com/sandbox` for sandbox testing.

Authentication is `Authorization: Token <API key>`.

## Implemented in this branch

- `topupmate-sync-catalogue`: administrator-only supplier catalogue sync from `GET /services/?service=...` and private gift-card snapshot from `GET /giftcard/available/`.
- `purchase-airtime-data`: authenticated Airtime/Data order reservation, Topupmate submission, idempotent supplier reference, and same-reference status lookup using `GET /transaction/status/?reference=...`.
- Supplier products remain private/unavailable until an administrator publishes them and configures Personal, Agent and Business prices.
- Virtual-card schema and customer navigation are foundations only; card issuance, funding, FX and card lifecycle operations are not enabled yet.

## Catalogue service keys

The sync function reads provider catalogue keys for network, airtime, data, cable-provider, cabletv, electricity, exampin, recharge-card, datapin, smile, alpha, kirani and ratel. It records raw responses in `provider_catalogue_snapshots`; only normalized products/options are candidates for publication. Gift-card catalogue is kept as a private snapshot until its product/denomination pricing and redemption mapping are verified.

## Purchase behaviour

- Client sends only the service, published product ID (for Data), network code, recipient, face value (Airtime), and idempotency key.
- Database reservation calculates the price and debits the wallet before supplier submission.
- Topupmate response states are interpreted as `success`, `fail`, and `processing`.
- On transport ambiguity, the function queries the original `ref` via `/transaction/status/`; it never submits a second order with a new reference.
- A confirmed supplier failure invokes the idempotent order refund RPC. A processing/unknown response remains under reconciliation.

## Migrations

Apply migrations in timestamp order, including:
- `20261121140000_topupmate_services_and_virtual_cards.sql`
- `20261121150000_topupmate_airtime_data_purchase_provider.sql`

The base catalogue and Airtime/Data purchase migrations must also already be applied.

## Not yet production-ready

Before enabling Topupmate in production:
1. Set `TOPUPMATE_API_KEY` in Supabase Edge Function secrets.
2. Apply all outstanding migrations.
3. Run catalogue sync against sandbox and inspect every endpoint's sync result.
4. Verify actual supplier plan IDs, pricing field semantics, network identifiers, and Airtime discount basis.
5. Configure Airtime supplier discount factors only from verified account pricing.
6. Test success, explicit failure, processing, timeout, duplicate requests, and same-reference reconciliation.
7. Confirm ledger balances and customer-facing history before activating the provider.

Never enable a provider or publish a product solely because an endpoint returned a non-empty payload.

## Virtual cards

The `topupmate-virtual-cards` Edge Function implements authenticated card operations:
- `list`, `quote`, `save_profile`, `create`, `topup`, `withdraw`, `details`, `transactions`, `freeze`, `unfreeze`, and `terminate`.
- Cardholder address and date of birth are stored in the service-role-only `cardholder_profiles` table. BVN/NIN is read from the user's approved encrypted KYC record and decrypted only inside the Edge Function.
- Card number/CVV are not persisted. Card credentials are retrieved from Topupmate on demand and returned only to the authenticated card owner.
- Card creation and funding debit the NGN wallet through an atomic, balanced journal reservation. Confirmed provider failures refund through an idempotent ledger transaction.
- Provider timeouts, HTTP errors and `processing` responses remain unknown/processing and are not automatically refunded or resubmitted. These require reconciliation; do not retry with a new reference.
- Withdrawals credit the NGN wallet only after Topupmate confirms success.
- Card transactions use `POST /cards/transactions/` with `card_id`, `start_date`, `end_date`, and `page`.

Card commercial pricing is stored in the Admin-managed `topupmate_card_pricing` table and edited from Admin → Finance → Virtual Cards. The creation fee, minimum initial funding, creation markup, minimum top-up and top-up markup are not Edge Function secrets. Only the Topupmate API key and KYC encryption key remain secrets.

Apply the card migrations after the service catalogue and wallet foundation migrations:
- `20261121140000_topupmate_services_and_virtual_cards.sql`
- `20261121160000_topupmate_virtual_card_lifecycle.sql`
- `20261121161000_virtual_card_operation_claim.sql`
- `20261121162000_fix_virtual_card_usd_accounting.sql`

Do not activate card issuance until the Admin-managed supplier fee and minimum funding values are verified against the Topupmate dashboard and sandbox create/fund/withdraw/freeze/unfreeze/terminate tests pass. The documented termination endpoint says remaining card funds are returned to the provider wallet; TolirexData does not automatically credit a customer's wallet from an unverified termination response.
