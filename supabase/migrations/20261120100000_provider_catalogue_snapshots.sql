-- Private provider catalogue snapshots. Raw supplier payloads remain server-only
-- until each endpoint has a verified normalizer and customer-safe projection.
create table if not exists public.provider_catalogue_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null references public.service_providers(code) on update cascade on delete restrict,
  catalogue_key text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  fetch_status text not null default 'success' check (fetch_status in ('success','failed')),
  error_summary text,
  unique(provider_code, catalogue_key)
);

alter table public.provider_catalogue_snapshots enable row level security;
revoke all on table public.provider_catalogue_snapshots from anon, authenticated;
grant all on table public.provider_catalogue_snapshots to service_role;

create index if not exists provider_catalogue_snapshots_fetched_idx
  on public.provider_catalogue_snapshots(provider_code, fetched_at desc);

comment on table public.provider_catalogue_snapshots is
  'Private raw snapshots from upstream service providers. Do not expose directly to browser clients; normalize into customer-safe catalogue views.';
