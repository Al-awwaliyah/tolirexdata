# Fresh Supabase project setup

Target project: `swjojapsfbzxnfvclsui`. Confirm this is still the intended project before deploying or applying migrations.

## Before applying SQL
1. Confirm the project is provisioned and the database is available.
2. Use the Supabase SQL Editor as project owner or use the configured Supabase CLI migration workflow.
3. Apply the original baseline files and `20261119090000_tolirexdata_platform_foundation.sql` only if they have not already been applied.
4. If the platform foundation has already been applied, continue with each pending migration below in ascending filename order. Do not replay a migration that is already recorded in Supabase migration history.

## Additive migrations after the platform foundation
Apply only those not already applied, in this exact order:

- `20261120100000_provider_catalogue_snapshots.sql`
- `20261120110000_kyc_secure_identity_and_virtual_accounts.sql`
- `20261120120000_remove_static_catalogue_seed.sql`
- `20261120230000_service_product_provider_identity.sql`
- `20261120231000_grant_service_catalogue_server_read.sql`
- `20261121100000_supplier_catalogue_normalization_and_publication.sql`
- `20261121110000_admin_catalogue_publication_pricing.sql`
- `20261121120000_admin_provider_controls.sql`
- `20261121130000_airtime_data_purchase_engine.sql`
- `20261121140000_preserve_admin_airtime_pricing_on_sync.sql`
- `20261121141000_topupmate_services_and_virtual_cards.sql`
- `20261121142000_topupmate_provider_and_categories.sql`
- `20261121143000_topupmate_expanded_capabilities.sql`
- `20261121150000_topupmate_airtime_data_purchase_provider.sql`
- `20261121160000_topupmate_virtual_card_lifecycle.sql`
- `20261121161000_virtual_card_operation_claim.sql`
- `20261121162000_fix_virtual_card_usd_accounting.sql`
- `20261121170000_admin_managed_topupmate_card_pricing.sql`
- `20261121180000_topupmate_expanded_service_order_reservations.sql`
- `20261121190000_admin_managed_service_category_pricing.sql`

Stop at the first SQL error. Do not skip a failed migration or run later files out of order. The Topupmate provider is inserted disabled; it must be explicitly enabled from Admin after credentials and catalogue sync have been checked.

## First administrator bootstrap
After migrations succeed, create your own account through the app's normal sign-up flow. Then, in the SQL Editor, replace the email below with the exact verified email used for that account and run this once:

```sql
insert into public.platform_admin_memberships (user_id, admin_role, active)
select id, 'super_admin', true
from auth.users
where lower(email) = lower('YOUR_VERIFIED_LOGIN_EMAIL')
on conflict (user_id) do update
set admin_role = 'super_admin', active = true, updated_at = now();
```

The query should affect exactly one account. Do not restore an email-based admin trigger or grant admin through browser code.

## Application configuration
Set these Vercel environment variables for Preview and Production:
- `VITE_SUPABASE_URL` = `https://swjojapsfbzxnfvclsui.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable key
- `SUPABASE_URL` = `https://swjojapsfbzxnfvclsui.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = the same publishable key for the TanStack Start server-side client
- `SUPABASE_SERVICE_ROLE_KEY` = server-only service-role secret

Set these Supabase Edge Function secrets:
- `TOPUPMATE_API_KEY`
- `KYC_ENCRYPTION_KEY` (32-byte base64 AES-GCM key)

Do not set card creation fees, minimum funding or markups as secrets. Configure those in Admin → Virtual Cards. Do not set ClubKonnect credentials; the integration has been retired.

## Important follow-up
If migrations were applied manually in the dashboard, reconcile Supabase CLI migration history before a later `supabase db push`; otherwise the CLI may attempt to replay migrations already applied manually. The GitHub Actions Edge Function workflow does not apply database migrations.
