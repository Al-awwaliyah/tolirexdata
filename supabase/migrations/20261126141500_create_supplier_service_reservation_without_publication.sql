-- Create/update the generic supplier service reservation RPC without requiring
-- manual publication. This is self-contained: it does not use regprocedure lookup
-- and therefore also repairs databases where the earlier function was never created.
alter table public.service_orders
  add column if not exists service_metadata jsonb not null default '{}'::jsonb;

create or replace function public.reserve_topupmate_service_order(
  p_user_id uuid,
  p_category_code text,
  p_product_id uuid,
  p_option_type text,
  p_option_code text,
  p_recipient text,
  p_face_value numeric,
  p_quantity integer,
  p_idempotency_key text,
  p_service_metadata jsonb default '{}'::jsonb
) returns public.service_orders
language plpgsql security definer set search_path=public as $$
declare
  v_order public.service_orders%rowtype;
  v_profile public.profiles%rowtype;
  v_category public.service_categories%rowtype;
  v_provider public.service_providers%rowtype;
  v_product public.service_products%rowtype;
  v_option public.provider_service_options%rowtype;
  v_rule public.pricing_rules%rowtype;
  v_wallet public.wallets%rowtype;
  v_cost numeric(18,2);
  v_price numeric(18,2);
  v_quantity integer:=coalesce(p_quantity,1);
  v_wallet_account uuid;
  v_provider_account uuid;
  v_journal uuid;
  v_recipient text:=nullif(trim(p_recipient),'');
  v_request_id text;
begin
  if p_user_id is null or nullif(trim(p_category_code),'') is null
     or nullif(trim(p_idempotency_key),'') is null
     or v_quantity<1 or v_quantity>100 then
    raise exception 'Invalid service purchase details';
  end if;
  select * into v_order from public.service_orders
   where user_id=p_user_id and idempotency_key=trim(p_idempotency_key);
  if found then return v_order; end if;

  select * into v_profile from public.profiles where id=p_user_id;
  if not found or coalesce(v_profile.account_status,'active')<>'active' then
    raise exception 'Account is not eligible to purchase';
  end if;
  select * into v_category from public.service_categories where code=trim(p_category_code) and active;
  if not found then raise exception 'Service is unavailable'; end if;
  select * into v_provider from public.service_providers where code='topupmate' and status in ('active','degraded');
  if not found then raise exception 'Topupmate service provider is not enabled'; end if;

  if p_product_id is not null then
    select * into v_product from public.service_products
     where id=p_product_id and category_id=v_category.id and provider_id=v_provider.id
       and active
     for update;
    if not found or v_product.cost_price is null or v_product.cost_price<=0 then
      raise exception 'Selected supplier product is not available';
    end if;
    v_cost:=round(v_product.cost_price*v_quantity,2);
    if v_product.currency<>'NGN' then raise exception 'This supplier product currency is not supported for wallet purchase'; end if;
    if v_product.network_or_operator is not null and p_option_code is not null
       and v_product.network_or_operator<>p_option_code then
      raise exception 'Selected product does not match the selected provider';
    end if;
    v_recipient:=coalesce(v_recipient,v_product.provider_product_code);
  else
    if p_option_type is null or nullif(trim(p_option_code),'') is null
       or p_face_value is null or p_face_value<=0 then
      raise exception 'A valid supplier option and amount are required';
    end if;
    select * into v_option from public.provider_service_options
     where provider_id=v_provider.id and category_id=v_category.id
       and option_type=p_option_type and option_code=trim(p_option_code)
       and active
     for update;
    if not found then raise exception 'Selected supplier operator is not available'; end if;
    v_cost:=round(p_face_value*v_quantity,2);
    v_recipient:=coalesce(v_recipient,trim(p_option_code));
  end if;

  select * into v_rule from public.pricing_rules r
   where r.active and r.account_type=coalesce(v_profile.account_type,'personal')
     and (r.product_id=case when p_product_id is not null then p_product_id else null end
       or (r.product_id is null and r.category_id=v_category.id))
     and (r.starts_at is null or r.starts_at<=now())
     and (r.ends_at is null or r.ends_at>now())
   order by (r.product_id is not null) desc,r.updated_at desc limit 1;

  if found then
    v_price:=coalesce(v_rule.fixed_selling_price*v_quantity,
      case when v_rule.markup_type='percentage'
        then round(v_cost*(1+v_rule.markup_value/100),2)
        else round(v_cost+v_rule.markup_value*v_quantity,2) end);
  elsif p_product_id is not null then
    v_price:=round(v_product.selling_price*v_quantity,2);
  else
    -- Meter/token purchases are amount-based; no hidden uplift is applied.
    -- Configure a category pricing rule in Admin if a fee or markup is required.
    v_price:=v_cost;
  end if;
  if v_price is null or v_price<v_cost or v_price<=0 then
    raise exception 'Customer selling price is invalid or below supplier cost';
  end if;

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found or v_wallet.wallet_status<>'active' or v_wallet.currency<>'NGN'
     or v_wallet.balance<v_price then
    raise exception 'Insufficient wallet balance or wallet unavailable';
  end if;

  v_request_id:='TRX'||upper(encode(gen_random_bytes(12),'hex'));
  insert into public.service_orders(user_id,category_id,product_id,provider_id,request_id,
    recipient,amount,currency,status,idempotency_key,service_metadata)
  values(p_user_id,v_category.id,p_product_id,v_provider.id,v_request_id,
    v_recipient,v_price,'NGN','pending',trim(p_idempotency_key),
    jsonb_build_object('service',v_category.code,'quantity',v_quantity,
      'supplier_product_code',case when p_product_id is not null then v_product.provider_product_code else null end,
      'supplier_option_type',p_option_type,'supplier_option_code',p_option_code)
      ||coalesce(p_service_metadata,'{}'::jsonb))
  returning * into v_order;

  select id into v_wallet_account from public.ledger_accounts
   where account_code='customer-wallet:'||p_user_id::text and currency='NGN';
  select id into v_provider_account from public.ledger_accounts
   where account_code='platform:provider-payable' and currency='NGN';
  if v_wallet_account is null or v_provider_account is null then raise exception 'Wallet ledger is not configured'; end if;

  update public.wallets set balance=balance-v_price where user_id=p_user_id;
  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('service_order',v_order.id,'service-order:'||v_order.id::text,
    'Topupmate '||v_category.name||' purchase reservation')
  returning id into v_journal;
  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_wallet_account,'debit',v_price,'NGN'),
        (v_journal,v_provider_account,'credit',v_price,'NGN');
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(p_user_id,v_price,'debit','service_order',v_order.id,v_category.name||' purchase');
  return v_order;
exception when unique_violation then
  select * into v_order from public.service_orders
   where user_id=p_user_id and idempotency_key=trim(p_idempotency_key);
  if found then return v_order; end if;
  raise;
end;
$$;

revoke all on function public.reserve_topupmate_service_order(uuid,text,uuid,text,text,text,numeric,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_topupmate_service_order(uuid,text,uuid,text,text,text,numeric,integer,text,jsonb) to service_role;
