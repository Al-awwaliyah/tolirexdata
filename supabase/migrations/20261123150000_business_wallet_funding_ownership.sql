-- Business-owned permanent virtual accounts and a separate business wallet ledger.
-- The personal/agent wallet model remains unchanged. Business deposits never credit the owner's personal wallet.

alter table public.virtual_accounts
  add column if not exists business_id uuid references public.businesses(id) on delete restrict;

alter table public.funding_events
  add column if not exists business_id uuid references public.businesses(id) on delete restrict;

alter table public.ledger_accounts
  add column if not exists business_id uuid references public.businesses(id) on delete restrict;

create table if not exists public.business_wallets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete restrict,
  balance numeric(18,2) not null default 0 check (balance >= 0),
  currency char(3) not null default 'NGN',
  wallet_status text not null default 'active' check (wallet_status in ('active','frozen','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The owner may have a personal/agent VA as well as a separate business VA.
-- Scope the user uniqueness constraint to non-business accounts only.
drop index if exists public.one_active_virtual_account_per_user;
drop index if exists public.virtual_accounts_one_active_permanent_user_uq;
create unique index if not exists virtual_accounts_one_active_permanent_personal_user_uq
  on public.virtual_accounts(user_id)
  where business_id is null and is_permanent = true and status = 'active';

create unique index if not exists virtual_accounts_one_active_permanent_business_uq
  on public.virtual_accounts(business_id)
  where business_id is not null and is_permanent = true and status = 'active';

create unique index if not exists virtual_accounts_provider_business_reference_uq
  on public.virtual_accounts(provider, account_reference)
  where business_id is not null and account_reference is not null;

create index if not exists funding_events_business_created_idx
  on public.funding_events(business_id, created_at desc)
  where business_id is not null;

insert into public.business_wallets(business_id)
select b.id
from public.businesses b
where b.status = 'active'
on conflict (business_id) do nothing;

create or replace function public.credit_flutterwave_funding(p_funding_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.funding_events%rowtype;
  v_wallet_account uuid;
  v_clearing_account uuid;
  v_journal uuid;
  v_amount numeric(18,2);
  v_currency char(3);
  v_key text;
begin
  select * into v_event
    from public.funding_events
   where id = p_funding_event_id
   for update;

  if not found then raise exception 'Funding event not found'; end if;
  if v_event.provider <> 'flutterwave'
     or v_event.status not in ('received','verified','credited') then
    raise exception 'Funding event is not eligible for settlement';
  end if;
  if v_event.status = 'credited' then
    return jsonb_build_object('credited', true, 'duplicate', true, 'event_id', v_event.id);
  end if;

  v_amount := round(v_event.amount::numeric, 2);
  v_currency := coalesce(v_event.currency, 'NGN');
  if v_amount <= 0 or v_currency <> 'NGN' then
    raise exception 'Invalid funding amount or currency';
  end if;

  insert into public.ledger_accounts(account_code,account_name,account_type,currency)
  values('FLUTTERWAVE_CLEARING_NGN','Flutterwave settlement clearing','asset','NGN')
  on conflict(account_code) do nothing;
  select id into v_clearing_account
    from public.ledger_accounts
   where account_code = 'FLUTTERWAVE_CLEARING_NGN';

  if v_event.business_id is not null then
    perform 1 from public.businesses
     where id = v_event.business_id and status = 'active'
     for update;
    if not found then raise exception 'Business is not active for funding'; end if;

    insert into public.business_wallets(business_id)
    values(v_event.business_id)
    on conflict(business_id) do nothing;

    perform 1 from public.business_wallets
     where business_id = v_event.business_id and wallet_status = 'active'
     for update;
    if not found then raise exception 'Business wallet is not active'; end if;

    insert into public.ledger_accounts(account_code,account_name,account_type,business_id,currency)
    values('business-wallet:' || v_event.business_id::text,'Business wallet liability','liability',v_event.business_id,'NGN')
    on conflict(account_code) do nothing;
    select id into v_wallet_account from public.ledger_accounts
     where account_code = 'business-wallet:' || v_event.business_id::text;
  else
    if v_event.user_id is null then raise exception 'Personal wallet owner is missing'; end if;
    perform 1 from public.wallets
     where user_id = v_event.user_id and wallet_status = 'active'
     for update;
    if not found then raise exception 'Customer wallet is not active'; end if;

    insert into public.ledger_accounts(account_code,account_name,account_type,user_id,currency)
    values('customer-wallet:' || v_event.user_id::text,'Customer wallet liability','liability',v_event.user_id,'NGN')
    on conflict(account_code) do nothing;
    select id into v_wallet_account from public.ledger_accounts
     where account_code = 'customer-wallet:' || v_event.user_id::text;
  end if;

  v_key := 'flutterwave:' || coalesce(v_event.provider_event_id,v_event.provider_transaction_id,v_event.tx_reference);
  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description,status)
  values('flutterwave_funding',v_event.id,v_key,'Flutterwave virtual account wallet funding','posted')
  on conflict(idempotency_key) do nothing
  returning id into v_journal;

  if v_journal is null then
    update public.funding_events
       set status = 'credited', processed_at = coalesce(processed_at,now())
     where id = v_event.id;
    return jsonb_build_object('credited',true,'duplicate',true,'event_id',v_event.id);
  end if;

  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_clearing_account,'debit',v_amount,'NGN'),
        (v_journal,v_wallet_account,'credit',v_amount,'NGN');

  if v_event.business_id is not null then
    update public.business_wallets
       set balance = balance + v_amount, updated_at = now()
     where business_id = v_event.business_id;
  else
    update public.wallets
       set balance = balance + v_amount, updated_at = now()
     where user_id = v_event.user_id;
    insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
    values(v_event.user_id,v_amount,'credit','funding',v_event.id,'Flutterwave virtual account deposit')
    on conflict do nothing;
  end if;

  update public.funding_events set status = 'credited', processed_at = now()
   where id = v_event.id;

  return jsonb_build_object(
    'credited',true,'duplicate',false,'event_id',v_event.id,
    'amount',v_amount,'currency',v_currency,'business_id',v_event.business_id
  );
end;
$$;

revoke all on function public.credit_flutterwave_funding(uuid) from public, anon, authenticated;
grant execute on function public.credit_flutterwave_funding(uuid) to service_role;

comment on table public.business_wallets is
  'Separate NGN wallet for an approved business; never shares the owner personal wallet balance.';
