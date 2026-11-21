-- Correct card funding aggregates: amounts are denominated in card USD, not wallet NGN.
alter table public.virtual_cards
  add column if not exists total_funded_usd numeric(18,2) not null default 0
  check(total_funded_usd>=0);

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
  v_existing_user uuid;
begin
  select * into v_op from public.virtual_card_operations where id=p_operation_id for update;
  if not found then raise exception 'Card operation not found'; end if;
  if v_op.status='successful' then return v_op; end if;
  if v_op.status not in ('pending','processing','unknown') then raise exception 'Card operation cannot be completed'; end if;

  if v_op.action='create' then
    v_provider_card_id:=nullif(trim(coalesce(p_card->>'provider_card_id','')),'');
    if v_provider_card_id is null then raise exception 'Provider card ID is required to complete issuance'; end if;
    select user_id into v_existing_user from public.virtual_cards
      where provider='topupmate' and provider_card_id=v_provider_card_id;
    if v_existing_user is not null and v_existing_user<>v_op.user_id then
      raise exception 'Provider card is already assigned to another account';
    end if;
    insert into public.virtual_cards(user_id,provider,provider_card_id,masked_pan,last4,card_type,currency,
      name_on_card,expiry_month,expiry_year,status,amount_funded,total_funded_usd,metadata)
    values(v_op.user_id,'topupmate',v_provider_card_id,nullif(p_card->>'masked_pan',''),
      nullif(p_card->>'last4',''),coalesce(nullif(p_card->>'card_type',''),'virtual'),
      coalesce(nullif(p_card->>'currency',''),'USD'),nullif(p_card->>'name_on_card',''),
      nullif(p_card->>'expiry_month',''),nullif(p_card->>'expiry_year',''),'active',
      v_op.amount_usd,v_op.amount_usd,
      jsonb_build_object('issued_reference',v_op.reference,'created_operation_id',v_op.id))
    on conflict(provider,provider_card_id) do update set
      masked_pan=excluded.masked_pan,last4=excluded.last4,status='active',updated_at=now()
    where virtual_cards.user_id=excluded.user_id
    returning id into v_card_id;
    if v_card_id is null then raise exception 'Provider card could not be linked to this account'; end if;
    update public.virtual_card_operations set virtual_card_id=v_card_id where id=p_operation_id returning * into v_op;
  elsif v_op.action='topup' then
    update public.virtual_cards set amount_funded=amount_funded+v_op.amount_usd,
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
