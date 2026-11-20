-- Store only encrypted identity values for KYC. The encryption key exists only as
-- a Supabase Edge Function secret; never store it in PostgreSQL or the repository.
alter table public.kyc_records
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone_number text,
  add column if not exists identity_kind text check (identity_kind in ('bvn','nin')),
  add column if not exists identity_ciphertext text,
  add column if not exists consent_at timestamptz,
  add column if not exists verification_method text,
  add column if not exists verified_at timestamptz;

create index if not exists kyc_records_user_status_idx
  on public.kyc_records(user_id,status,created_at desc);

comment on column public.kyc_records.identity_ciphertext is
  'AES-GCM encrypted BVN/NIN payload. Decryption key is a Supabase Edge Function secret and must never be exposed to clients.';
