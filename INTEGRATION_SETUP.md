# TolirexData — provider and payment integration handoff

## Current project state

The uploaded project uses TanStack Start + React + Supabase. The current database schema has only `data_orders`, `data_plans`, `fundings`, `wallets`, and `wallet_transactions`. The wallet transaction `reference_type` constraint only accepts `data_order` and `funding`. A safe live multi-service implementation therefore needs a database change before enabling purchases: one idempotent service-order record, provider request/reference/status fields, and atomic wallet reserve/settle/refund routines. The schema must be updated through the project's chosen database deployment workflow. Inspect the live schema first, preserve existing data and policies, and verify every migration before deployment.

## ClubKonnect (Nellobyte) API

Official developer entry point: https://www.clubkonnect.com/APIDocs

The ClubKonnect page links to Nellobyte REST API v1 and documents legacy HTTPS JSON endpoints. All API calls must originate server-side. Configure these as server secrets (never `VITE_` variables):

- `CLUBKONNECT_USER_ID`
- `CLUBKONNECT_API_KEY`
- `CLUBKONNECT_CALLBACK_URL` (your public HTTPS callback endpoint)

Read-only catalogue endpoints implemented in `src/lib/clubkonnect.server.ts` and exposed through the authenticated `getClubKonnectCatalog` server function:

- Data network list: `APIDatabundleNetworkV1.asp`
- Data plans: `APIDatabundlePlansV3.asp`
- Airtime networks: `APIAirtimeNetworkV2.asp`
- Cable providers: `APICableTVTypeV2.asp`
- Cable packages: `APICableTVPackagesV2.asp`
- Electricity DisCos: `APIElectricityDiscosV1.asp`
- Airtime PIN services/discounts: `APIEPINDiscountV2.asp`

Purchase endpoint map (implement only after the wallet/order schema and atomic settlement routines are deployed):

| Service | Endpoint | Key parameters |
|---|---|---|
| Airtime | `APIAirtimeV1.asp` | `MobileNetwork`, `Amount`, `MobileNumber`, `RequestID`, `CallBackURL` |
| Data | `APIDatabundleV1.asp` | `MobileNetwork`, `DataPlan` (provider product code), `MobileNumber`, `RequestID`, `CallBackURL` |
| Cable TV | `APICableTVV1.asp` | `CableTV`, `Package`, `SmartCardNo`, `PhoneNo`, `RequestID`, `CallBackURL` |
| Cable verification | `APIVerifyCableTVV1.asp` | `CableTV`, `SmartCardNo` |
| Electricity | `APIElectricityV1.asp` | `ElectricCompany`, `MeterType`, `MeterNo`, `Amount`, `PhoneNo`, `RequestID`, `CallBackURL` |
| Meter verification | `APIVerifyElectricityV1.asp` | `ElectricCompany`, `MeterNo`, `MeterType` |
| Airtime recharge PIN | `APIEPINV1.asp` | `MobileNetwork`, `Value` (100/200/500), `Quantity` (1–100), `RequestID` |
| Transaction status | `APIQueryV1.asp` | `OrderID` or `RequestID` |

Important:
- Generate and persist a unique `RequestID` before calling ClubKonnect.
- Never treat `ORDER_RECEIVED` as completed. It means accepted/queued; reconcile using callback and/or `APIQueryV1.asp`.
- For cable and electricity, verify the smartcard/meter first and show the returned customer identity before confirming purchase.
- Do not retry a timed-out purchase with a new reference. Requery the original `RequestID` to avoid duplicate vending.
- Treat ePIN values as sensitive: display them only to the purchasing user and do not write PINs to application logs.

## Flutterwave wallet funding

A server-only `createFlutterwaveFundingCheckout` function now creates a pending card-funding row and a hosted checkout link using the funding UUID as `tx_ref`. It requires `FLUTTERWAVE_SECRET_KEY` and `APP_URL`. It is intentionally not wired to a customer-facing button until atomic webhook settlement is deployed.

Use Flutterwave Standard hosted Checkout:

1. Authenticated server creates a pending `fundings` row using method `card`.
2. Use the funding UUID as a unique `tx_ref` and create the hosted payment link with `POST https://api.flutterwave.com/v3/payments`.
3. Redirect the customer to the returned `data.link`.
4. On callback/webhook, verify the transaction server-side using `GET /v3/transactions/{id}/verify`.
5. Require exact `tx_ref`, successful status, NGN currency, and exact expected amount.
6. Credit the wallet exactly once in a single database transaction that locks the pending funding row, changes it to approved, increments the wallet, and inserts the matching credit ledger row. Reject duplicate callbacks.
7. Do not credit from the browser redirect alone.

Required server secret: `FLUTTERWAVE_SECRET_KEY`. Configure the webhook secret hash/signature validation in the server environment and enable the webhook in Flutterwave Dashboard.

The existing database has no persisted Flutterwave transaction ID and no dedicated atomic card-settlement routine. Do not turn on card funding until the required schema change provides an atomic, idempotent settlement function. This prevents duplicate credits and partial wallet updates.

## Required database schema work

Implement and deploy the following schema changes through the project's database workflow:
- `service_orders` with user, service type, provider, product/variation code, amount, recipient, unique `request_id`, provider `order_id`, status, safe response metadata, and timestamps.
- `fundings.tx_ref` unique nullable and `fundings.flutterwave_transaction_id` unique nullable.
- `wallet_transactions.reference_type` support for service orders, with a unique reference constraint.
- `create_service_order_and_debit_wallet(...)` that validates the authenticated user, locks wallet, debits once, and inserts a pending order.
- `settle_service_order(...)` and `refund_service_order(...)` that are idempotent and update the wallet/ledger atomically.
- `settle_flutterwave_funding(...)` that locks the pending funding, validates its amount/reference, credits wallet, inserts ledger credit, and marks it approved atomically.
- RLS policies so customers can read only their own service orders and admins can review all.

## UI redesign

The current UI refresh in this branch is a premium, original fintech layout inspired by Revolut's hierarchy and spacing. It does not reuse Revolut logos, proprietary assets, or exact screen artwork.
