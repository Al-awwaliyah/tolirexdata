-- Unify Flutterwave funding postings with the canonical customer-wallet ledger account.
-- Preserve existing balances and journals while moving entries off the duplicate legacy code.
insert into public.ledger_accounts(account_code,account_name,account_type,user_id,currency)
select 'customer-wallet:'||w.user_id::text,'Customer wallet liability','liability',w.user_id,w.currency
from public.wallets w
on conflict(account_code) do nothing;

update public.ledger_entries le
set ledger_account_id=canonical.id
from public.ledger_accounts legacy
join public.ledger_accounts canonical
  on canonical.account_code='customer-wallet:'||legacy.user_id::text
where legacy.account_code like 'CUSTOMER_WALLET_%'
  and legacy.user_id is not null
  and le.ledger_account_id=legacy.id;

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
  values('customer-wallet:'||v_event.user_id::text,'Customer wallet liability','liability',v_event.user_id,'NGN')
  on conflict(account_code) do nothing;
  select id into v_wallet_account from public.ledger_accounts
    where account_code='customer-wallet:'||v_event.user_id::text;
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
