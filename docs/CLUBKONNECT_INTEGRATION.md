# TolirexData ClubKonnect integration

## Architecture

ClubKonnect credentials and supplier payloads remain server-side. The Edge Function
`clubkonnect-sync-catalogue` retrieves supplier catalogues, stores private snapshots,
normalizes supported records, and upserts supplier products/options into Supabase.

New products and options are created inactive and unpublished. Supplier refreshes
update supplier facts and last-seen timestamps but preserve administrator publication
and selling-price decisions. If a refreshed supplier cost makes an existing account
price lower than cost, the product is automatically unpublished for review.

Customers read only the `public_service_catalog` and `public_service_options`
projections. These expose published products/options from an active or degraded
provider and never expose supplier cost or raw supplier metadata. The product view
calculates account pricing from the authenticated profile's account type and active
pricing rules.

## Supported launch catalogue sources

| TolirexData service | ClubKonnect source | Normalized records |
|---|---|---|
| Airtime | `APIAirtimeNetworkV2.asp` | Network/operator options; top-up amount is entered by the customer |
| Data | `APIDatabundleNetworkV1.asp`, `APIDatabundlePlansV2.asp` | Networks and data plans |
| Cable TV | `APICableTVTypeV2.asp`, `APICableTVPackagesV2.asp` | Cable providers and packages |
| Electricity | `CLUBKONNECT_ELECTRICITY_BILLERS_JSON` | Account-provided disco and meter-type options |
| Recharge PINs | `APIEPINDiscountV2.asp` | Airtime PIN denominations where the supplier discount response can be normalized |

Data E-PIN, Smile, WAEC and JAMB are not included in the launch catalogue.

The supplied integration source treats electricity disco and meter-type data as
account-specific catalogue configuration. The importer therefore does not invent
disco codes or assume an undocumented public endpoint. If the supplier account
provides the catalogue JSON, store it as the
`CLUBKONNECT_ELECTRICITY_BILLERS_JSON` Supabase Edge Function secret.

## Admin workflow

1. An administrator with `services.manage` runs a ClubKonnect catalogue sync.
2. The importer stores raw snapshots privately and creates normalized, unpublished
   product and option records.
3. A provider manager explicitly enables ClubKonnect. It is disabled by default.
4. A service manager publishes supplier-derived networks/operators.
5. An administrator with both `services.manage` and `pricing.manage` sets
   Personal, Agent and Business selling prices and publishes each product.
6. Customer catalogue projections expose only published records and the price for
   the customer's account type.

Every publication, pricing change and provider status change is written to
`audit_logs`.

## Required Supabase secrets

- `CLUBKONNECT_USER_ID`
- `CLUBKONNECT_API_KEY`
- `CLUBKONNECT_ELECTRICITY_BILLERS_JSON` (only if the supplier provides this account-specific catalogue)

Set these as Supabase Edge Function secrets. Never place supplier credentials in
browser environment variables or commit them to Git.

## Database migrations

Apply these migrations in chronological order after the earlier foundation and
snapshot migrations:

1. `20261120230000_service_product_provider_identity.sql`
2. `20261120231000_grant_service_catalogue_server_read.sql`
3. `20261121100000_supplier_catalogue_normalization_and_publication.sql`
4. `20261121110000_admin_catalogue_publication_pricing.sql`
5. `20261121120000_admin_provider_controls.sql`

The Edge Function deployment workflow is triggered automatically by pushes to
`feat/tolirexdata-platform-foundation` that change files under
`supabase/functions/**`. This workflow deploys functions; it does not apply SQL
migrations.

## Not yet enabled

This catalogue work does not enable service purchases. Airtime, data, cable,
electricity and recharge-PIN purchase flows still need to be ported to the
TolirexData order-reservation and double-entry ledger workflow. In particular,
the old IyanjuPay `debit_wallet` / `refund_wallet` calls must not be reused.
A provider timeout must leave the order in an uncertain/reconciliation state until
the original ClubKonnect RequestID is queried; it must not trigger a new request ID
or an automatic refund without a definitive provider failure.
