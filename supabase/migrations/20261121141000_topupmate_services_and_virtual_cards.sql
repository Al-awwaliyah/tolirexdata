-- Topupmate service expansion and virtual-card foundation.
-- All provider credentials and card operations remain server-side.
insert into public.service_categories(code,name,description,sort_order,active) values
 ('gift_card','Gift Cards','Digital gift-card catalogue and fulfilment',60,true),
 ('data_pin','Data PINs','Mobile data PIN products',70,true),
 ('internet','Internet Services','Smile and other supported broadband services',80,true),
 ('virtual_card','Virtual Cards','USD and NGN virtual payment cards',90,true),
 ('fx_conversion','Currency Exchange','Provider-quoted foreign exchange conversions',100,true),
 ('bulk_sms','Bulk SMS','Business messaging services',110,false)
on conflict(code) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order;

insert into public.service_providers(code,name,status,priority,supports_airtime,supports_data,supports_cable,supports_electricity,supports_epin)
values('topupmate','Topupmate','disabled',10,true,true,true,true,true)
on conflict(code) do update set name=excluded.name,priority=excluded.priority,
 supports_airtime=true,supports_data=true,supports_cable=true,supports_electricity=true,supports_epin=true;

-- ClubKonnect is retained as an inactive historical provider record only.
update public.service_providers set status='disabled' where code in ('clubkonnect','nellobyte');

create table if not exists public.virtual_cards(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 provider text not null default 'topupmate',
 provider_card_id text not null,
 masked_pan text,
 last4 char(4),
 card_type text not null default 'virtual',
 currency char(3) not null default 'USD',
 name_on_card text,
 expiry_month text,
 expiry_year text,
 status text not null default 'pending' check(status in ('pending','active','frozen','terminated','failed')),
 amount_funded numeric(18,2) not null default 0 check(amount_funded>=0),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider,provider_card_id)
);
create index if not exists virtual_cards_user_idx on public.virtual_cards(user_id,created_at desc);
alter table public.virtual_cards enable row level security;
drop policy if exists virtual_cards_owner_read on public.virtual_cards;
create policy virtual_cards_owner_read on public.virtual_cards
 for select to authenticated using(user_id=auth.uid());
revoke all on public.virtual_cards from anon,authenticated;
grant select on public.virtual_cards to authenticated;
grant all on public.virtual_cards to service_role;

comment on table public.virtual_cards is
 'User-owned Topupmate card references. Store only masked PAN/last4 and non-sensitive metadata; never persist full PAN, CVV, or card credentials.';
