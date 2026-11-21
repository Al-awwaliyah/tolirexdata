-- Secure Topupmate virtual-card lifecycle and wallet-ledger operations.
-- Cardholder identity data is server-only; provider card credentials are never persisted.
create table if not exists public.cardholder_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,
  date_of_birth date not null,
  address text not null,
  state text not null,
  city text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cardholder_profiles enable row level security;
revoke all on public.cardholder_profiles from anon, authenticated;
grant all on public.cardholder_profiles to service_role;

alter table public.virtual_cards
  add column if not exists total_funded_usd numeric(18,2) not null default 0 check(total_funded_usd>=0),
  add column if not exists last_balance_usd numeric(18,2),
  add column if not exists last_provider_sync_at timestamptz;
alter table public.virtual_cards
  alter column metadata set default '{}'::jsonb;

create table if not exists public.virtual_card_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  virtual_card_id uuid references public.virtual_cards(id) on delete restrict,
  action text not null check(action in ('create','topup','withdraw','freeze','unfreeze','terminate')),
  reference text not null unique,
  idempotency_key text not null,
  amount_usd numeric(18,2),
  wallet_amount_ngn numeric(18,2) not null default 0 check(wallet_amount_ngn>=0),
  fx_rate numeric(18,8),
  status text not null default 'pending' check(status in ('pending','processing','unknown','successful','failed','refunded')),
  provider_reference text,
  provider_status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
create index if not exists virtual_card_operations_user_idx
  on public.virtual_card_operations(user_id,created_at desc);
create index if not exists virtual_card_operations_pending_idx
  on public.virtual_card_operations(status,created_at)
  where status in ('pending','processing','unknown');
alter table public.virtual_card_operations enable row level security;
revoke all on public.virtual_card_operations from anon,authenticated;
grant all on public.virtual_card_operations to service_role;

alter table public.wallet_transactions drop constraint if exists wallet_transactions_reference_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_reference_type_check
  check(reference_type in ('data_order','funding','service_order','referral_reward','coupon','wallet_adjustment','virtual_card'));

create or replace function public.reserve_virtual_card_operation(
  p_user_id uuid,p_action text,p_virtual_card_id uuid,p_reference text,
  p_idempotency_key text,p_amount_usd numeric,p_wallet_amount_ngn numeric,
  p_fx_rate numeric,p_metadata jsonb default '{}'::jsonb
) returns public.virtual_card_operations
language plpgsql security definer set search_path=public as $$
declare
  v_op public.virtual_card_operations%rowtype;
  v_wallet public.wallets%rowtype;
  v_card public.virtual_cards%rowtype;
  v_wallet_account uuid;
  v_provider_account uuid;
  v_journal uuid;
  v_debit boolean;
begin
  if p_user_id is null or p_action not in ('create','topup','withdraw','freeze','unfreeze','terminate')
     or nullif(trim(p_reference),'') is null or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'Invalid virtual card operation';
  end if;
  select * into v_op from public.virtual_card_operations
    where user_id=p_user_id and idempotency_key=trim(p_idempotency_key);
  if found then return v_op; end if;

  v_debit:=p_action in ('create','topup');
  if p_action<>'create' then
    select * into v_card from public.virtual_cards
      where id=p_virtual_card_id and user_id=p_user_id and provider='topupmate'
      for update;
    if not found then raise exception 'Virtual card not found'; end if;
    if p_action in ('topup','withdraw','freeze','unfreeze') and v_card.status not in ('active','frozen') then
      raise exception 'Virtual card is not available for this operation';
    end if;
    if p_action='topup' and v_card.status<>'active' then raise exception 'Unfreeze the card before funding it'; end if;
    if p_action='freeze' and v_card.status<>'active' then raise exception 'Card is not active'; end if;
    if p_action='unfreeze' and v_card.status<>'frozen' then raise exception 'Card is not frozen'; end if;
    if p_action='terminate' and v_card.status='terminated' then raise exception 'Card is already terminated'; end if;
  elsif p_virtual_card_id is not null then
    raise exception 'A new card cannot have an existing card ID';
  end if;

  if p_action in ('create','topup','withdraw') and
     (p_amount_usd is null or p_amount_usd<=0 or p_wallet_amount_ngn is null or p_wallet_amount_ngn<=0 or p_fx_rate is null or p_fx_rate<=0) then
    raise exception 'A valid amount and exchange rate are required';
  end if;

  if v_debit then
    select * into v_wallet from public.wallets where user_id=p_user_id for update;
    if not found or v_wallet.wallet_status<>'active' or v_wallet.currency<>'NGN' then
      raise exception 'NGN wallet is unavailable';
    end if;
    if v_wallet.balance<p_wallet_amount_ngn then raise exception 'Insufficient wallet balance'; end if;
  end if;

  insert into public.virtual_card_operations(user_id,virtual_card_id,action,reference,idempotency_key,
    amount_usd,wallet_amount_ngn,fx_rate,status,metadata)
  values(p_user_id,p_virtual_card_id,p_action,trim(p_reference),trim(p_idempotency_key),
    p_amount_usd,coalesce(p_wallet_amount_ngn,0),p_fx_rate,'pending',coalesce(p_metadata,'{}'::jsonb))
  returning * into v_op;

  if v_debit then
    select id into v_wallet_account from public.ledger_accounts
      where account_code='customer-wallet:'||p_user_id::text and currency='NGN';
    select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
    if v_wallet_account is null or v_provider_account is null then raise exception 'Wallet ledger is not configured'; end if;
    update public.wallets set balance=balance-p_wallet_amount_ngn where user_id=p_user_id;
    insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
    values('virtual_card_debit',v_op.id,'virtual-card-debit:'||v_op.id::text,
      case when p_action='create' then 'Virtual card issuance and initial funding' else 'Virtual card funding' end)
    returning id into v_journal;
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_wallet_account,'debit',p_wallet_amount_ngn,'NGN'),
          (v_journal,v_provider_account,'credit',p_wallet_amount_ngn,'NGN');
    insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
    values(p_user_id,p_wallet_amount_ngn,'debit','virtual_card',v_op.id::text,
      case when p_action='create' then 'Virtual card creation and initial funding' else 'Virtual card funding' end);
  end if;
  return v_op;
exception when unique_violation then
  select * into v_op from public.virtual_card_operations
    where user_id=p_user_id and idempotency_key=trim(p_idempotency_key);
  if found then return v_op; end if;
  raise;
end;
$$;

create or replace function public.mark_virtual_card_operation(
  p_operation_id uuid,p_status text,p_provider_status text default null,p_provider_reference text default null,p_message text default null
) returns public.virtual_card_operations
language plpgsql security definer set search_path=public as $$
declare v_op public.virtual_card_operations%rowtype;
begin
  if p_status not in ('processing','unknown') then raise exception 'Invalid operation status'; end if;
  update public.virtual_card_operations set status=p_status,provider_status=p_provider_status,
    provider_reference=coalesce(p_provider_reference,provider_reference),message=left(p_message,500),updated_at=now()
  where id=p_operation_id and status in ('pending','processing','unknown') returning * into v_op;
  if not found then select * into v_op from public.virtual_card_operations where id=p_operation_id; end if;
  if v_op.id is null then raise exception 'Card operation not found'; end if;
  return v_op;
end;
$$;

create or replace function public.complete_virtual_card_operation(
  p_operation_id uuid,p_provider_status text,p_provider_reference text default null,
  p_message text default null,p_card jsonb default null
) returns public.virtual_card_operations
language plpgsql security definer set search_path=public as $$
declare
  v_op public.virtual_card_operations%rowtype;
  v_card_id uuid;
  v_wallet public.wallets%rowtype;
  v_wallet_account uuid;
  v_provider_account uuid;
  v_journal uuid;
  v_provider_card_id text;
begin
  select * into v_op from public.virtual_card_operations where id=p_operation_id for update;
  if not found then raise exception 'Card operation not found'; end if;
  if v_op.status='successful' then return v_op; end if;
  if v_op.status not in ('pending','processing','unknown') then raise exception 'Card operation cannot be completed'; end if;

  if v_op.action='create' then
    v_provider_card_id:=nullif(trim(coalesce(p_card->>'provider_card_id','')),'');
    if v_provider_card_id is null then raise exception 'Provider card ID is required to complete issuance'; end if;
    insert into public.virtual_cards(user_id,provider,provider_card_id,masked_pan,last4,card_type,currency,
      name_on_card,expiry_month,expiry_year,status,amount_funded,total_funded_usd,metadata)
    values(v_op.user_id,'topupmate',v_provider_card_id,nullif(p_card->>'masked_pan',''),
      nullif(p_card->>'last4',''),coalesce(nullif(p_card->>'card_type',''),'virtual'),
      coalesce(nullif(p_card->>'currency',''),'USD'),nullif(p_card->>'name_on_card',''),
      nullif(p_card->>'expiry_month',''),nullif(p_card->>'expiry_year',''),'active',
      v_op.wallet_amount_ngn,v_op.amount_usd,
      jsonb_build_object('issued_reference',v_op.reference,'created_operation_id',v_op.id))
    on conflict(provider,provider_card_id) do update set
      masked_pan=excluded.masked_pan,last4=excluded.last4,status='active',updated_at=now()
    returning id into v_card_id;
    update public.virtual_card_operations set virtual_card_id=v_card_id where id=p_operation_id returning * into v_op;
  elsif v_op.action='topup' then
    update public.virtual_cards set amount_funded=amount_funded+v_op.wallet_amount_ngn,
      total_funded_usd=total_funded_usd+v_op.amount_usd,updated_at=now()
    where id=v_op.virtual_card_id and user_id=v_op.user_id;
  elsif v_op.action='withdraw' then
    select * into v_wallet from public.wallets where user_id=v_op.user_id for update;
    if not found or v_wallet.wallet_status<>'active' or v_wallet.currency<>'NGN' then
      raise exception 'NGN wallet is unavailable for withdrawal credit';
    end if;
    select id into v_wallet_account from public.ledger_accounts
      where account_code='customer-wallet:'||v_op.user_id::text and currency='NGN';
    select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
    if v_wallet_account is null or v_provider_account is null then raise exception 'Wallet ledger is not configured'; end if;
    update public.wallets set balance=balance+v_op.wallet_amount_ngn where user_id=v_op.user_id;
    insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
    values('virtual_card_withdrawal',v_op.id,'virtual-card-withdrawal:'||v_op.id::text,'Virtual card withdrawal credit')
    returning id into v_journal;
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_provider_account,'debit',v_op.wallet_amount_ngn,'NGN'),
          (v_journal,v_wallet_account,'credit',v_op.wallet_amount_ngn,'NGN');
    insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
    values(v_op.user_id,v_op.wallet_amount_ngn,'credit','virtual_card',v_op.id::text,'Virtual card withdrawal');
  elsif v_op.action='freeze' then
    update public.virtual_cards set status='frozen',updated_at=now() where id=v_op.virtual_card_id and user_id=v_op.user_id;
  elsif v_op.action='unfreeze' then
    update public.virtual_cards set status='active',updated_at=now() where id=v_op.virtual_card_id and user_id=v_op.user_id;
  elsif v_op.action='terminate' then
    update public.virtual_cards set status='terminated',updated_at=now() where id=v_op.virtual_card_id and user_id=v_op.user_id;
  end if;

  update public.virtual_card_operations set status='successful',provider_status=p_provider_status,
    provider_reference=coalesce(p_provider_reference,provider_reference),message=left(p_message,500),updated_at=now()
  where id=p_operation_id returning * into v_op;
  return v_op;
end;
$$;

create or replace function public.refund_virtual_card_operation(
  p_operation_id uuid,p_provider_status text default 'fail',p_reason text default 'Topupmate rejected the request'
) returns public.virtual_card_operations
language plpgsql security definer set search_path=public as $$
declare
  v_op public.virtual_card_operations%rowtype;
  v_wallet public.wallets%rowtype;
  v_wallet_account uuid;
  v_provider_account uuid;
  v_journal uuid;
begin
  select * into v_op from public.virtual_card_operations where id=p_operation_id for update;
  if not found then raise exception 'Card operation not found'; end if;
  if v_op.status='refunded' then return v_op; end if;
  if v_op.action not in ('create','topup') or v_op.status not in ('pending','processing','unknown') then
    raise exception 'This card operation cannot be refunded';
  end if;
  select * into v_wallet from public.wallets where user_id=v_op.user_id for update;
  if not found then raise exception 'Customer wallet not found'; end if;
  select id into v_wallet_account from public.ledger_accounts
    where account_code='customer-wallet:'||v_op.user_id::text and currency='NGN';
  select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
  if v_wallet_account is null or v_provider_account is null then raise exception 'Wallet ledger is not configured'; end if;
  update public.wallets set balance=balance+v_op.wallet_amount_ngn where user_id=v_op.user_id;
  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('virtual_card_refund',v_op.id,'virtual-card-refund:'||v_op.id::text,'Confirmed failed virtual card operation refund')
  returning id into v_journal;
  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_wallet_account,'credit',v_op.wallet_amount_ngn,'NGN'),
        (v_journal,v_provider_account,'debit',v_op.wallet_amount_ngn,'NGN');
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(v_op.user_id,v_op.wallet_amount_ngn,'credit','virtual_card',v_op.id::text,'Virtual card operation refund');
  update public.virtual_card_operations set status='refunded',provider_status=p_provider_status,
    message=left(p_reason,500),updated_at=now() where id=p_operation_id returning * into v_op;
  return v_op;
end;
$$;

revoke all on function public.reserve_virtual_card_operation(uuid,text,uuid,text,text,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.mark_virtual_card_operation(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_virtual_card_operation(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.refund_virtual_card_operation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_virtual_card_operation(uuid,text,uuid,text,text,numeric,numeric,numeric,jsonb) to service_role;
grant execute on function public.mark_virtual_card_operation(uuid,text,text,text,text) to service_role;
grant execute on function public.complete_virtual_card_operation(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.refund_virtual_card_operation(uuid,text,text) to service_role;

comment on table public.cardholder_profiles is 'Server-only cardholder details required by Topupmate card issuance. Access only from Edge Functions using service_role.';
comment on table public.virtual_card_operations is 'Idempotent virtual-card financial operation log; all wallet movements are ledger-backed and server-only.';
