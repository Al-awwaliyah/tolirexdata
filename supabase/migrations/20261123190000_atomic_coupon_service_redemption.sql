-- Atomic coupon redemption for catalogue-driven Topupmate purchases.
-- Remove the prior 10-argument overload so all service reservations use the coupon-aware function.
drop function if exists public.reserve_topupmate_service_order(uuid,text,uuid,text,text,text,numeric,integer,text,jsonb);
-- Customer wallet is charged the discounted amount; promotion expense funds the discount.
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
  p_service_metadata jsonb default '{}'::jsonb,
  p_coupon_code text default null
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
  v_coupon public.coupons%rowtype;
  v_wallet public.wallets%rowtype;
  v_cost numeric(18,2);
  v_price numeric(18,2);
  v_discount numeric(18,2):=0;
  v_charge numeric(18,2);
  v_quantity integer:=coalesce(p_quantity,1);
  v_wallet_account uuid;
  v_provider_account uuid;
  v_promo_account uuid;
  v_journal uuid;
  v_recipient text:=nullif(trim(p_recipient),'');
  v_request_id text;
  v_coupon_code text:=nullif(upper(trim(coalesce(p_coupon_code,''))),'');
  v_used integer;
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
       and active and publication_status='published' for update;
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
       and active and publication_status='published' for update;
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
    v_price:=v_cost;
  end if;
  if v_price is null or v_price<v_cost or v_price<=0 then
    raise exception 'Customer selling price is invalid or below supplier cost';
  end if;

  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code=v_coupon_code and active for update;
    if not found then raise exception 'This coupon is invalid or inactive'; end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at>now() then raise exception 'This coupon is not active yet'; end if;
    if v_coupon.ends_at is not null and v_coupon.ends_at<=now() then raise exception 'This coupon has expired'; end if;
    if v_price<v_coupon.min_order_amount then raise exception 'This purchase does not meet the coupon minimum order amount'; end if;
    select count(*) into v_used from public.coupon_redemptions
      where coupon_id=v_coupon.id and user_id=p_user_id and status in ('reserved','applied');
    if v_used>=v_coupon.per_user_limit then raise exception 'You have already used this coupon the maximum number of times'; end if;
    select count(*) into v_used from public.coupon_redemptions
      where coupon_id=v_coupon.id and status in ('reserved','applied');
    if v_coupon.total_redemption_limit is not null and v_used>=v_coupon.total_redemption_limit then
      raise exception 'This coupon has reached its redemption limit';
    end if;
    if v_coupon.discount_type='percentage' then
      v_discount:=round(v_price*v_coupon.discount_value/100,2);
    else
      v_discount:=round(v_coupon.discount_value,2);
    end if;
    if v_coupon.max_discount is not null then v_discount:=least(v_discount,v_coupon.max_discount); end if;
    v_discount:=least(v_discount,v_price);
    if v_coupon.budget_amount is not null and v_coupon.budget_spent+v_discount>v_coupon.budget_amount then
      raise exception 'This coupon campaign has exhausted its discount budget';
    end if;
  end if;
  v_charge:=round(v_price-v_discount,2);
  if v_charge<=0 then raise exception 'Coupon discount cannot reduce the purchase to zero'; end if;

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found or v_wallet.wallet_status<>'active' or v_wallet.currency<>'NGN'
     or v_wallet.balance<v_charge then
    raise exception 'Insufficient wallet balance or wallet unavailable';
  end if;

  v_request_id:='TRX'||upper(encode(gen_random_bytes(12),'hex'));
  insert into public.service_orders(user_id,category_id,product_id,provider_id,request_id,
    recipient,amount,currency,status,idempotency_key,service_metadata)
  values(p_user_id,v_category.id,p_product_id,v_provider.id,v_request_id,
    v_recipient,v_charge,'NGN','pending',trim(p_idempotency_key),
    jsonb_build_object('service',v_category.code,'quantity',v_quantity,
      'supplier_product_code',case when p_product_id is not null then v_product.provider_product_code else null end,
      'supplier_option_type',p_option_type,'supplier_option_code',p_option_code,
      'original_amount',v_price,'coupon_code',v_coupon_code,'coupon_discount',v_discount,
      'coupon_id',case when v_coupon_code is not null then v_coupon.id::text else null end)
      ||coalesce(p_service_metadata,'{}'::jsonb))
  returning * into v_order;

  select id into v_wallet_account from public.ledger_accounts where account_code='customer-wallet:'||p_user_id::text and currency='NGN';
  select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable' and currency='NGN';
  if v_wallet_account is null or v_provider_account is null then raise exception 'Wallet ledger is not configured'; end if;
  if v_discount>0 then
    insert into public.ledger_accounts(account_code,account_name,account_type,currency)
    values('platform:coupon-expense','Coupon promotion expense','expense','NGN')
    on conflict(account_code) do nothing;
    select id into v_promo_account from public.ledger_accounts where account_code='platform:coupon-expense' and currency='NGN';
    if v_promo_account is null then raise exception 'Coupon promotion ledger is not configured'; end if;
  end if;

  update public.wallets set balance=balance-v_charge where user_id=p_user_id;
  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('service_order',v_order.id,'service-order:'||v_order.id::text,
    'Topupmate '||v_category.name||' purchase reservation')
  returning id into v_journal;
  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_wallet_account,'debit',v_charge,'NGN'),
        (v_journal,v_provider_account,'credit',v_price,'NGN');
  if v_discount>0 then
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_promo_account,'debit',v_discount,'NGN');
    update public.coupons set budget_spent=budget_spent+v_discount,updated_at=now() where id=v_coupon.id;
    insert into public.coupon_redemptions(coupon_id,user_id,service_order_id,discount_amount,status)
    values(v_coupon.id,p_user_id,v_order.id,v_discount,'reserved');
  end if;
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(p_user_id,v_charge,'debit','service_order',v_order.id,v_category.name||' purchase');
  return v_order;
exception when unique_violation then
  select * into v_order from public.service_orders
   where user_id=p_user_id and idempotency_key=trim(p_idempotency_key);
  if found then return v_order; end if;
  raise;
end;
$$;

create or replace function public.complete_catalogue_service_order(
  p_order_id uuid,p_provider_order_id text,p_provider_status text,p_message text default null
) returns public.service_orders
language plpgsql security definer set search_path=public as $$
declare v_order public.service_orders%rowtype;
begin
  update public.service_orders set status='successful',
    provider_order_id=coalesce(p_provider_order_id,provider_order_id),
    provider_status=p_provider_status,provider_message=left(p_message,500),updated_at=now()
  where id=p_order_id and status in ('pending','processing','unknown') returning * into v_order;
  if not found then
    select * into v_order from public.service_orders where id=p_order_id;
    if v_order.status='successful' then return v_order; end if;
    raise exception 'Order cannot be completed from current state';
  end if;
  update public.coupon_redemptions set status='applied'
   where service_order_id=p_order_id and status='reserved';
  return v_order;
end;
$$;

create or replace function public.fail_and_refund_catalogue_service_order(
  p_order_id uuid,p_provider_status text,p_reason text
) returns public.service_orders
language plpgsql security definer set search_path=public as $$
declare
  v_order public.service_orders%rowtype;
  v_wallet_account uuid;
  v_provider_account uuid;
  v_promo_account uuid;
  v_journal uuid;
  v_discount numeric(18,2):=0;
  v_original numeric(18,2);
  v_coupon_id uuid;
begin
  select * into v_order from public.service_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status='refunded' then return v_order; end if;
  if v_order.status not in ('pending','processing','unknown') then raise exception 'Order is not refundable'; end if;
  v_discount:=coalesce((v_order.service_metadata->>'coupon_discount')::numeric,0);
  v_original:=coalesce((v_order.service_metadata->>'original_amount')::numeric,v_order.amount);
  v_coupon_id:=nullif(v_order.service_metadata->>'coupon_id','')::uuid;
  update public.wallets set balance=balance+v_order.amount where user_id=v_order.user_id;
  select id into v_wallet_account from public.ledger_accounts where account_code='customer-wallet:'||v_order.user_id::text and currency='NGN';
  select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable' and currency='NGN';
  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('service_order_refund',v_order.id,'service-order-refund:'||v_order.id::text,left(coalesce(p_reason,'Supplier confirmed failure'),200))
  returning id into v_journal;
  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_wallet_account,'credit',v_order.amount,'NGN'),
        (v_journal,v_provider_account,'debit',v_original,'NGN');
  if v_discount>0 then
    select id into v_promo_account from public.ledger_accounts where account_code='platform:coupon-expense' and currency='NGN';
    if v_promo_account is null then raise exception 'Coupon promotion ledger is not configured'; end if;
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_promo_account,'credit',v_discount,'NGN');
    update public.coupons set budget_spent=greatest(0,budget_spent-v_discount),updated_at=now()
      where id=v_coupon_id;
    update public.coupon_redemptions set status='released'
      where service_order_id=v_order.id and status='reserved';
  end if;
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(v_order.user_id,v_order.amount,'credit','service_order',v_order.id,'Confirmed failed service order refund');
  update public.service_orders set status='refunded',provider_status=p_provider_status,
    provider_message=left(p_reason,500),updated_at=now() where id=p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.reserve_topupmate_service_order(uuid,text,uuid,text,text,text,numeric,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_topupmate_service_order(uuid,text,uuid,text,text,text,numeric,integer,text,jsonb,text) to service_role;
revoke all on function public.complete_catalogue_service_order(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_catalogue_service_order(uuid,text,text,text) to service_role;
revoke all on function public.fail_and_refund_catalogue_service_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.fail_and_refund_catalogue_service_order(uuid,text,text) to service_role;
