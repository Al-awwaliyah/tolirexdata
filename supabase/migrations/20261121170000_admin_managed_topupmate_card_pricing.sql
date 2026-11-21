-- Admin-controlled Topupmate virtual-card commercial settings.
-- Supplier credentials remain secrets; commercial prices and margins are business settings.
create table if not exists public.topupmate_card_pricing (
  singleton boolean primary key default true check (singleton),
  card_creation_enabled boolean not null default false,
  creation_fee_usd numeric(18,2) not null default 0 check (creation_fee_usd >= 0),
  minimum_initial_funding_usd numeric(18,2) not null default 0 check (minimum_initial_funding_usd >= 0),
  creation_markup_usd numeric(18,2) not null default 0 check (creation_markup_usd >= 0),
  topup_minimum_usd numeric(18,2) not null default 0 check (topup_minimum_usd >= 0),
  topup_markup_percent numeric(9,4) not null default 0 check (topup_markup_percent >= 0 and topup_markup_percent <= 100),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.topupmate_card_pricing enable row level security;
revoke all on public.topupmate_card_pricing from public,anon,authenticated;
grant all on public.topupmate_card_pricing to service_role;
insert into public.topupmate_card_pricing(singleton,card_creation_enabled,creation_fee_usd,minimum_initial_funding_usd,creation_markup_usd,topup_minimum_usd,topup_markup_percent)
values(true,false,0,0,0,0,0)
on conflict(singleton) do nothing;

insert into public.admin_permissions(permission_key,description)
values('cards.pricing.manage','Manage Topupmate virtual-card fees, funding minimums and markups')
on conflict(permission_key) do update set description=excluded.description;
insert into public.admin_role_permissions(admin_role,permission_key)
values('super_admin','cards.pricing.manage'),('finance_admin','cards.pricing.manage')
on conflict do nothing;

create or replace function public.admin_set_topupmate_card_pricing(
  p_creation_enabled boolean,
  p_creation_fee_usd numeric,
  p_minimum_initial_funding_usd numeric,
  p_creation_markup_usd numeric,
  p_topup_minimum_usd numeric,
  p_topup_markup_percent numeric
) returns public.topupmate_card_pricing
language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid:=auth.uid();
  v_before jsonb;
  v_after public.topupmate_card_pricing%rowtype;
begin
  if v_actor is null or not public.has_admin_permission('cards.pricing.manage') then
    raise exception 'Virtual-card pricing permission is required';
  end if;
  if p_creation_fee_usd is null or p_creation_fee_usd<0
    or p_minimum_initial_funding_usd is null or p_minimum_initial_funding_usd<=0
    or p_creation_markup_usd is null or p_creation_markup_usd<0
    or p_topup_minimum_usd is null or p_topup_minimum_usd<0
    or p_topup_markup_percent is null or p_topup_markup_percent<0 or p_topup_markup_percent>100 then
    raise exception 'Enter valid card fees, minimums and markups';
  end if;
  select to_jsonb(p) into v_before from public.topupmate_card_pricing p where singleton=true;
  insert into public.topupmate_card_pricing(singleton,card_creation_enabled,creation_fee_usd,minimum_initial_funding_usd,creation_markup_usd,topup_minimum_usd,topup_markup_percent,updated_by,updated_at)
  values(true,p_creation_enabled,p_creation_fee_usd,p_minimum_initial_funding_usd,p_creation_markup_usd,p_topup_minimum_usd,p_topup_markup_percent,v_actor,now())
  on conflict(singleton) do update set
    card_creation_enabled=excluded.card_creation_enabled,
    creation_fee_usd=excluded.creation_fee_usd,
    minimum_initial_funding_usd=excluded.minimum_initial_funding_usd,
    creation_markup_usd=excluded.creation_markup_usd,
    topup_minimum_usd=excluded.topup_minimum_usd,
    topup_markup_percent=excluded.topup_markup_percent,
    updated_by=v_actor,updated_at=now()
  returning * into v_after;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,before_data,after_data)
  values(v_actor,'virtual_cards.pricing.updated','topupmate_card_pricing','singleton',
    coalesce(v_before,'{}'::jsonb),
    jsonb_build_object('card_creation_enabled',v_after.card_creation_enabled,
      'creation_fee_usd',v_after.creation_fee_usd,
      'minimum_initial_funding_usd',v_after.minimum_initial_funding_usd,
      'creation_markup_usd',v_after.creation_markup_usd,
      'topup_minimum_usd',v_after.topup_minimum_usd,
      'topup_markup_percent',v_after.topup_markup_percent));
  return v_after;
end;
$$;
revoke all on function public.admin_set_topupmate_card_pricing(boolean,numeric,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_set_topupmate_card_pricing(boolean,numeric,numeric,numeric,numeric,numeric) to authenticated;
