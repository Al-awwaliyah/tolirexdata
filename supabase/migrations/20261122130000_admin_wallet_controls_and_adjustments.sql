-- Admin wallet controls: audited status changes and balanced, idempotent adjustments.
-- Wallet balance remains a compatibility projection; the matching journal is mandatory.
create or replace function public.admin_adjust_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_direction text,
  p_reason text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_wallet_account uuid;
  v_offset_account uuid;
  v_journal uuid;
  v_reference_id uuid := gen_random_uuid();
  v_existing public.journal_transactions%rowtype;
  v_reason text := left(trim(coalesce(p_reason,'')),500);
  v_balance_before numeric(18,2);
  v_balance_after numeric(18,2);
begin
  if p_user_id is null or p_amount is null or p_amount <= 0
     or p_amount <> round(p_amount,2)
     or p_direction is null or p_direction not in ('credit','debit')
     or length(v_reason) < 5
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{12,120}
    raise exception 'Invalid wallet adjustment details';
  end if;

  select * into v_existing from public.journal_transactions
    where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.reference_type <> 'wallet_adjustment' then
      raise exception 'Idempotency key already belongs to another operation';
    end if;
    return jsonb_build_object('journal_id',v_existing.id,'replayed',true);
  end if;

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found then raise exception 'Wallet not found'; end if;
  if v_wallet.wallet_status <> 'active' then raise exception 'Wallet must be active for adjustment'; end if;
  if v_wallet.currency <> 'NGN' then raise exception 'Only NGN wallet adjustments are supported'; end if;
  v_balance_before := v_wallet.balance;
  if p_direction='debit' and v_wallet.balance < p_amount then
    raise exception 'Adjustment exceeds available wallet balance';
  end if;

  select id into v_wallet_account from public.ledger_accounts
    where account_code='customer-wallet:'||p_user_id::text;
  if v_wallet_account is null then raise exception 'Wallet ledger account missing'; end if;

  if p_direction='credit' then
    select id into v_offset_account from public.ledger_accounts where account_code='platform:promotion-expense';
  else
    select id into v_offset_account from public.ledger_accounts where account_code='platform:promotion-expense';
  end if;
  if v_offset_account is null then raise exception 'Adjustment control ledger account missing'; end if;

  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('wallet_adjustment',v_reference_id,p_idempotency_key,'Admin wallet '||p_direction||': '||v_reason)
  returning id into v_journal;

  if p_direction='credit' then
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_offset_account,'debit',p_amount,v_wallet.currency),
          (v_journal,v_wallet_account,'credit',p_amount,v_wallet.currency);
    update public.wallets set balance=balance+p_amount,updated_at=now() where user_id=p_user_id returning balance into v_balance_after;
  else
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_wallet_account,'debit',p_amount,v_wallet.currency),
          (v_journal,v_offset_account,'credit',p_amount,v_wallet.currency);
    update public.wallets set balance=balance-p_amount,updated_at=now() where user_id=p_user_id returning balance into v_balance_after;
  end if;

  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(p_user_id,p_amount,p_direction,'wallet_adjustment',v_journal,'Admin adjustment: '||v_reason);

  return jsonb_build_object('journal_id',v_journal,'replayed',false,'balance_before',v_balance_before,'balance_after',v_balance_after,'currency',v_wallet.currency);
exception when unique_violation then
  select * into v_existing from public.journal_transactions where idempotency_key=p_idempotency_key;
  if found and v_existing.reference_type='wallet_adjustment' then
    return jsonb_build_object('journal_id',v_existing.id,'replayed',true);
  end if;
  raise;
end;
$$;

revoke all on function public.admin_adjust_wallet(uuid,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_adjust_wallet(uuid,numeric,text,text,text) to service_role;

     or p_idempotency_key not like 'aw:%:'||p_user_id::text||':%' then
    raise exception 'Invalid wallet adjustment details';
  end if;

  select * into v_existing from public.journal_transactions
    where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.reference_type <> 'wallet_adjustment' then
      raise exception 'Idempotency key already belongs to another operation';
    end if;
    return jsonb_build_object('journal_id',v_existing.id,'replayed',true);
  end if;

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found then raise exception 'Wallet not found'; end if;
  if v_wallet.wallet_status <> 'active' then raise exception 'Wallet must be active for adjustment'; end if;
  if v_wallet.currency <> 'NGN' then raise exception 'Only NGN wallet adjustments are supported'; end if;
  v_balance_before := v_wallet.balance;
  if p_direction='debit' and v_wallet.balance < p_amount then
    raise exception 'Adjustment exceeds available wallet balance';
  end if;

  select id into v_wallet_account from public.ledger_accounts
    where account_code='customer-wallet:'||p_user_id::text;
  if v_wallet_account is null then raise exception 'Wallet ledger account missing'; end if;

  if p_direction='credit' then
    select id into v_offset_account from public.ledger_accounts where account_code='platform:promotion-expense';
  else
    select id into v_offset_account from public.ledger_accounts where account_code='platform:promotion-expense';
  end if;
  if v_offset_account is null then raise exception 'Adjustment control ledger account missing'; end if;

  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('wallet_adjustment',v_reference_id,p_idempotency_key,'Admin wallet '||p_direction||': '||v_reason)
  returning id into v_journal;

  if p_direction='credit' then
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_offset_account,'debit',p_amount,v_wallet.currency),
          (v_journal,v_wallet_account,'credit',p_amount,v_wallet.currency);
    update public.wallets set balance=balance+p_amount,updated_at=now() where user_id=p_user_id returning balance into v_balance_after;
  else
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_wallet_account,'debit',p_amount,v_wallet.currency),
          (v_journal,v_offset_account,'credit',p_amount,v_wallet.currency);
    update public.wallets set balance=balance-p_amount,updated_at=now() where user_id=p_user_id returning balance into v_balance_after;
  end if;

  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(p_user_id,p_amount,p_direction,'wallet_adjustment',v_journal,'Admin adjustment: '||v_reason);

  return jsonb_build_object('journal_id',v_journal,'replayed',false,'balance_before',v_balance_before,'balance_after',v_balance_after,'currency',v_wallet.currency);
exception when unique_violation then
  select * into v_existing from public.journal_transactions where idempotency_key=p_idempotency_key;
  if found and v_existing.reference_type='wallet_adjustment' then
    return jsonb_build_object('journal_id',v_existing.id,'replayed',true);
  end if;
  raise;
end;
$$;

revoke all on function public.admin_adjust_wallet(uuid,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_adjust_wallet(uuid,numeric,text,text,text) to service_role;
