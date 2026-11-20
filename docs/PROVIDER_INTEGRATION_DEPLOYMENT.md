# TolirexData provider integration deployment

## Current delivery

The platform foundation migration is separate from Edge Function deployment. Supabase Edge Functions do not deploy through the Vercel frontend deployment.

Added source:
- `supabase/functions/clubkonnect-sync-catalogue/index.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/migrations/20261120100000_provider_catalogue_snapshots.sql`

The sync function requires a signed-in platform administrator with the `services.manage` permission. It fetches the documented catalogue endpoints and stores private raw snapshots. It does not publish raw provider responses to customers and does not create guessed products or prices.

## Required Supabase secrets

Set these in Supabase Edge Function secrets (not Vercel frontend variables):

- `CLUBKONNECT_USER_ID`
- `CLUBKONNECT_API_KEY`

The function uses the Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` runtime secrets. Never add the service-role key to browser environment variables or Git.

ClubKonnect documents HTTPS JSON API calls and recommends enabling 2FA and server IP whitelisting. If IP whitelisting is enabled, ensure the outbound IP used by the Edge Function runtime is compatible with the supplier's policy.

## Deploy sequence

1. Apply `20261120100000_provider_catalogue_snapshots.sql` to the same replacement Supabase project.
2. Set the two ClubKonnect secrets.
3. Deploy the `clubkonnect-sync-catalogue` Edge Function.
4. Keep the ClubKonnect provider disabled until credentials are confirmed and a successful sync has been reviewed.
5. Trigger the function using an authenticated Super Admin/Services Admin JWT.
6. Inspect the private snapshots in Supabase. Do not grant browser access to `provider_catalogue_snapshots`.

The Edge Function can be deployed with the Supabase CLI from the repository root:

```bash
supabase functions deploy clubkonnect-sync-catalogue --project-ref swjojapsfbzxnfvclsui
supabase secrets set CLUBKONNECT_USER_ID=... CLUBKONNECT_API_KEY=... --project-ref swjojapsfbzxnfvclsui
```

Do not paste supplier credentials into GitHub files, Vercel frontend variables, SQL, or chat.

## Catalogue publication gate

The sync function stores raw upstream snapshots only. The actual response shape must be inspected using the merchant's live/test API credentials before implementing normalizers. Product names, provider product codes, network identifiers, denominations, validity and supplier prices must come from ClubKonnect responses. Customer prices are then calculated server-side using database pricing rules. Supplier costs and raw provider metadata remain private.

Do not create hardcoded data bundles, cable packages, electricity products, airtime denominations or ePIN plans. If an upstream catalogue endpoint does not return a product family, keep that family unavailable rather than inventing catalogue rows.

## Virtual-account and KYC gate

Flutterwave's current V3 documentation describes permanent NGN virtual accounts as requiring a customer's BVN or NIN and a unique transaction reference. A customer submitting a KYC form is not automatically verified. Store identity values only encrypted, obtain explicit consent, and issue the account only after the configured verification/approval process succeeds. Confirm that static virtual accounts are enabled on the merchant account before production.

## KYC submission and review foundation

Added source:
- `supabase/functions/_shared/identity-crypto.ts`
- `supabase/functions/submit-kyc/index.ts`
- `supabase/functions/review-kyc/index.ts`
- `supabase/migrations/20261120110000_kyc_secure_identity_and_virtual_accounts.sql`

The KYC submission function requires explicit consent and encrypts the supplied BVN or NIN with AES-GCM before storing it. The encryption key is not stored in the database.

Generate a 32-byte key and set it only as a Supabase Edge Function secret:

```bash
openssl rand -base64 32
supabase secrets set KYC_ENCRYPTION_KEY='YOUR_GENERATED_BASE64_KEY' --project-ref swjojapsfbzxnfvclsui
```

Deploy the two functions after applying the KYC migration:
```bash
supabase functions deploy submit-kyc --project-ref swjojapsfbzxnfvclsui
supabase functions deploy review-kyc --project-ref swjojapsfbzxnfvclsui
```

KYC review is currently an authorized staff review workflow. It is not an automated BVN/NIN verification service. Provision a Super Admin and grant the `kyc.review` permission before testing staff review. Never mark a record approved merely because a form was submitted.

## Still not implemented

- Flutterwave permanent virtual-account issuance after approved KYC.
- Flutterwave deposit webhook verification and atomic wallet credit.
- Catalogue response normalizers and customer-safe dynamic catalogue publication.
- Provider purchase, status-query and refund workflows.

Do not enable real-money operations until these controls are implemented and tested.

## Deploy without a local Supabase CLI

A manual GitHub Actions workflow is available at `.github/workflows/deploy-supabase-functions.yml`.

1. In GitHub, open the repository Settings → Secrets and variables → Actions.
2. Add an Actions secret named `SUPABASE_ACCESS_TOKEN` using a Supabase personal access token. Do not commit or paste this token into chat.
3. Open Actions → Deploy TolirexData Supabase Edge Functions.
4. Select the feature branch `feat/tolirexdata-platform-foundation` and run the workflow manually.

This workflow deploys the catalogue sync and KYC submission/review functions only. It does not deploy the frontend, apply database migrations, create a virtual account, or enable live payment processing.
