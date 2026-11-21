-- Flutterwave permanent virtual accounts and webhook-settled wallet funding.
-- Legacy manual funding requests remain historical only; they are no longer used by the customer funding flow.

alter table public.profiles
  add column if not exists account_type text not null default 'personal'
    check (account_type in ('personal','agent','business')),
  add column if not exists business_legal_name text,
  add column if not exists business_registration_number text;

alter table public.virtual_accounts
  add column if not exists provider_session_id text,
  add column if not exists account_reference text,
  add column if not exists issued_at timestamptz,
  add column if not exists last_verified_at timestamptz;

create unique index if not exists virtual_accounts_provider_reference_uq
  on public.virtual_accounts(provider, provider_reference)
  where provider_reference is not null;
create unique index if not exists virtual_accounts_one_active_permanent_user_uq
  on public.virtual_accounts(user_id)
  where is_permanent = true and status = 'active';

create unique index if not exists funding_events_provider_event_uq
  on public.funding_events(provider, provider_event_id)
  where provider_event_id is not null;
create unique index if not exists funding_events_provider_tx_uq
  on public.funding_events(provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists funding_events_user_created_idx
  on public.funding_events(user_id, created_at desc);

-- Keep the signup account type in the authoritative profile and provision the
-- matching account workspace without granting it privileges.
create or replace function public.handle_new_tolirexdata_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text;
begin
  v_type := case when new.raw_user_meta_data->>'account_type' in ('personal','agent','business')
    then new.raw_user_meta_data->>'account_type' else 'personal' end;
  insert into public.profiles(id,email,full_name,phone,account_type)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'phone',''),v_type)
  on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,
    phone=excluded.phone,account_type=excluded.account_type;
  insert into public.wallets(user_id) values(new.id) on conflict(user_id) do nothing;
  insert into public.user_roles(user_id,role) values(new.id,'user') on conflict do nothing;
  if v_type='agent' then
    insert into public.agent_accounts(user_id,status) values(new.id,'pending') on conflict(user_id) do nothing;
  end if;
  return new;
end $$;

-- One idempotent database operation credits a verified Flutterwave event.
-- It posts a balanced journal and updates the legacy balance projection atomically.
create or replace function public.credit_flutterwave_funding(p_funding_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_event public.funding_events%rowtype;
  v_wallet_account uuid;
  v_clearing_account uuid;
  v_journal uuid;
  v_amount numeric(18,2);
  v_currency char(3);
  v_key text;
begin
  select * into v_event from public.funding_events where id=p_funding_event_id for update;
  if not found then raise exception 'Funding event not found'; end if;
  if v_event.provider <> 'flutterwave' or v_event.status not in ('received','verified','credited') then
    raise exception 'Funding event is not eligible for settlement';
  end if;
  if v_event.status='credited' then
    return jsonb_build_object('credited',true,'duplicate',true,'event_id',v_event.id);
  end if;
  v_amount := round(v_event.amount::numeric,2);
  v_currency := coalesce(v_event.currency,'NGN');
  if v_amount<=0 or v_currency<>'NGN' then raise exception 'Invalid funding amount or currency'; end if;
  perform 1 from public.wallets where user_id=v_event.user_id for update;
  if not found then raise exception 'Customer wallet not found'; end if;

  insert into public.ledger_accounts(account_code,account_name,account_type,currency)
  values('FLUTTERWAVE_CLEARING_NGN','Flutterwave settlement clearing','asset','NGN')
  on conflict(account_code) do nothing;
  select id into v_clearing_account from public.ledger_accounts where account_code='FLUTTERWAVE_CLEARING_NGN';
  insert into public.ledger_accounts(account_code,account_name,account_type,user_id,currency)
  values('CUSTOMER_WALLET_'||replace(v_event.user_id::text,'-',''),'Customer wallet liability','liability',v_event.user_id,'NGN')
  on conflict(account_code) do nothing;
  select id into v_wallet_account from public.ledger_accounts
    where account_code='CUSTOMER_WALLET_'||replace(v_event.user_id::text,'-','');
  v_key := 'flutterwave:'||coalesce(v_event.provider_event_id,v_event.provider_transaction_id,v_event.tx_reference);
  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description,status)
  values('flutterwave_funding',v_event.id,v_key,'Flutterwave virtual account wallet funding','posted')
  on conflict(idempotency_key) do nothing
  returning id into v_journal;
  if v_journal is null then
    update public.funding_events set status='credited',processed_at=coalesce(processed_at,now()) where id=v_event.id;
    return jsonb_build_object('credited',true,'duplicate',true,'event_id',v_event.id);
  end if;

  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_clearing_account,'debit',v_amount,'NGN'),
        (v_journal,v_wallet_account,'credit',v_amount,'NGN');
  update public.wallets set balance=balance+v_amount,updated_at=now() where user_id=v_event.user_id;
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(v_event.user_id,v_amount,'credit','funding',v_event.id,'Flutterwave virtual account deposit')
  on conflict do nothing;
  update public.funding_events set status='credited',processed_at=now() where id=v_event.id;
  return jsonb_build_object('credited',true,'duplicate',false,'event_id',v_event.id,'amount',v_amount,'currency',v_currency);
end $$;

revoke all on function public.credit_flutterwave_funding(uuid) from public,anon,authenticated;
grant execute on function public.credit_flutterwave_funding(uuid) to service_role;

comment on function public.credit_flutterwave_funding(uuid) is
  'Idempotent service-role-only settlement for verified Flutterwave virtual-account transfers.';
