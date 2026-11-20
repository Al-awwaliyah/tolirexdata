# Fresh Supabase project setup

Target project: `swjojapsfbzxnfvclsui`

The repository's Supabase CLI config is already pointed at this project. Do not paste service-role keys, database passwords, Flutterwave secrets or ClubKonnect secrets into source files or chat.

## Before applying SQL

1. Confirm the project is fully provisioned and its database is available.
2. Use the Supabase SQL Editor while signed in as the project owner.
3. Apply the migration files in this exact order:
   - `supabase/migrations/20261110095819_738dc3c9-e381-4e90-bed9-5178f56aeafd.sql`
   - `supabase/migrations/20261110153231_9d5c55f2-ae5a-4d40-bf37-570c181b9a16.sql`
   - `supabase/migrations/20261110153305_e530b7d0-58e0-4fc0-b623-3f6b8b2ac3fe.sql`
   - `supabase/migrations/20261119090000_tolirexdata_platform_foundation.sql`
4. Stop and report the first SQL error. Do not skip a failed migration or run later files out of order.

These migrations establish the existing application baseline and the new additive platform foundation. They do not provision a Flutterwave virtual account, activate ClubKonnect, import supplier catalogue prices, or enable real transactions.

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

The query should affect exactly one account. If it affects zero or more than one, stop and verify the account before proceeding. Do not restore the old hardcoded email-based admin trigger or grant yourself admin through browser code.

## Application configuration

Set these Vercel environment variables for Preview and Production (and Development if used):

- `VITE_SUPABASE_URL` = `https://swjojapsfbzxnfvclsui.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable key

Set server-only credentials in the deployment/server secret store, never in Vite-prefixed variables:

- `SUPABASE_URL` = `https://swjojapsfbzxnfvclsui.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = the same project's publishable key (needed by the TanStack Start server-side client)
- `SUPABASE_SERVICE_ROLE_KEY` = server-only service-role secret

Do not deploy to the production domain until authentication redirects and the deployment URL are known. The Vercel deployment URL has not yet been supplied, so configure Supabase Auth Site URL and Redirect URLs after confirming the actual deployment hostname.

## Important follow-up

The first three SQL files are the repository's legacy baseline. They are retained to preserve compatibility with the current application. The old sample data-plan prices have been removed; no unverified prices should be offered to customers. After applying the foundation, run schema/RLS checks and review the ledger and public catalogue view before enabling any payment or fulfilment flow.

If the SQL files are applied manually in the dashboard, reconcile Supabase CLI migration history before a later `supabase db push`; otherwise the CLI may attempt to replay migrations already applied manually.
