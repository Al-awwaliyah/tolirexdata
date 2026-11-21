# TolirexData Topupmate Integration

Topupmate is the launch VTU provider. All provider calls run from Supabase Edge Functions; the API key is never exposed to browser code.

## API configuration

Set Supabase Edge Function secrets:
- `TOPUPMATE_API_KEY`: secret from the Topupmate account.
- The API base URL is fixed in server code to `https://connect.topupmate.com/api`; only `TOPUPMATE_API_KEY` is configured as a secret.nal; defaults to `https://connect.topupmate.com/api`. Use `(sandbox endpoint intentionally unsupported)` for sandbox testing.

Authentication is `Authorization: Token <API key>`.

## Implemented in this branch

- `topupmate-sync-catalogue`: administrator-only supplier catalogue sync from `GET /services/?service=...`, provider lists from `GET /status/`, and normalized gift-card products from `GET /giftcard/available/`.
- `purchase-airtime-data`: authenticated Airtime/Data order reservation, Topupmate submission, idempotent supplier reference, and same-reference status lookup using `GET /transaction/status/?reference=...`.
- `topupmate-expanded-services`: authenticated Cable TV, Electricity, Recharge PIN, Data PIN, Education PIN, Internet and Gift Card verification/purchase/status operations. Cable and meter details are verified before wallet debit; PIN and gift-card products are dynamically synchronized and must be published by an administrator.
- Supplier products remain private/unavailable until an administrator publishes them and configures Personal, Agent and Business prices.
- Virtual-card schema and customer navigation are foundations only; card issuance, funding, FX and card lifecycle operations are not enabled yet.

## Catalogue service keys

The sync function reads provider catalogue keys for network, airtime, data, cabletv, exampin, rechargepin, datapin, smile, alpha, kirani and ratel. Cable and electricity provider options are derived from the supplier `/status/` response, matching the IyanjuPay Topupmate service integration. It records raw responses in `provider_catalogue_snapshots`; only normalized products/options are candidates for publication. Gift-card products are normalized by supplier product ID and supplier-provided recipient denomination → sender-price mappings; the platform does not invent denominations or supplier prices.

## Purchase behaviour

- Client sends only the service, published product ID (for Data), network code, recipient, face value (Airtime), and idempotency key.
- Database reservation calculates the price and debits the wallet before supplier submission.
- Topupmate response states are interpreted as `success`, `fail`, and `processing`.
- On transport ambiguity, the function queries the original `ref` via `/transaction/status/`; it never submits a second order with a new reference.
- A confirmed supplier failure invokes the idempotent order refund RPC. A processing/unknown response remains under reconciliation.

## Migrations

Apply migrations in timestamp order, including:
- `20261121141000_topupmate_services_and_virtual_cards.sql`
- `20261121142000_topupmate_provider_and_categories.sql`
- `20261121143000_topupmate_expanded_capabilities.sql`
- `20261121150000_topupmate_airtime_data_purchase_provider.sql`
- `20261121170000_admin_managed_topupmate_card_pricing.sql`
- `20261121180000_topupmate_expanded_service_order_reservations.sql`

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

## Expanded service operations

The expanded service Edge Function reuses the authenticated Topupmate service patterns from the working IyanjuPay integration:
- Cable verification: `POST /cabletv/verify/` with `provider` and `iucnumber`; purchase: `POST /cabletv/` with provider, IUC, supplier plan ID, reference and optional contact phone.
- Electricity verification: `POST /electricity/verify/` with provider, meter number and meter type; purchase: `POST /electricity/` with provider, meter number, amount, meter type, phone and reference.
- Recharge PIN: `POST /rechargepin/` with supplier plan code, network, quantity and reference.
- Data PIN: `POST /datapin/` with supplier data-plan ID, network, quantity and reference.
- Education PIN: `POST /exam/` with supplier exam-provider ID, quantity and reference.
- Smile Internet: `POST /smile-data/` with phone/account identifier, bundle type code, account type and reference. Other synced internet products use the corresponding Topupmate provider route.
- Gift cards: `POST /giftcard/` with supplier product ID, recipient denomination, recipient email, units and reference; successful purchase is followed by `GET /giftcard/redeem/?ref=...` to retrieve the voucher.

These payload shapes follow the working IyanjuPay Edge Function at [Al-awwaliyah/iyanjupay](https://github.com/Al-awwaliyah/iyanjupay/blob/eaae5484c00a7d5e5acf9b61c9898bd6586ca6b0/supabase/functions/topupmate-services/index.ts) and the supplied [Topupmate API documentation](https://connect.topupmate.com/docs/). Validate actual request and response variants against the TolirexData sandbox account before activating the provider.

Additional migration:
- `20261121180000_topupmate_expanded_service_order_reservations.sql`

Customer-facing PIN and gift-card fulfilment values are returned only after supplier success. Do not log PINs, gift-card redemption codes or card credentials.
