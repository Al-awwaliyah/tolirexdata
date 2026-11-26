-- Align airtime pricing with IyanjuPay's Topupmate integration.
-- Airtime is amount-based: the supplier is charged the requested face value,
-- and Admin configures the customer selling price by account type.
create or replace function public.reserve_catalogue_service_order(
  p_user_id uuid,
  p_service_code text,
  p_product_id uuid,
  p_network_code text,
  p_recipient text,
  p_airtime_face_value numeric,
  p_idempotency_key text,
  p_coupon_code text default null
) returns public.service_orders
language plpgsql security definer set search_path=public as $$
declare
  v_order public.service_orders%rowtype;
  v_wallet public.wallets%rowtype;
  v_profile public.profiles%rowtype;
  v_product public.service_products%rowtype;
  v_option public.provider_service_options%rowtype;
  v_category public.service_categories%rowtype;
  v_provider public.service_providers%rowtype;
  v_rule public.pricing_rules%rowtype;
  v_cost numeric(18,2);
  v_price numeric(18,2);
  v_face numeric(18,2);
  v_discount numeric;
  v_min numeric;
  v_max numeric;
  v_request_id text;
  v_wallet_account uuid;
  v_provider_account uuid;
  v_journal uuid;
  v_category_id uuid;
  v_coupon public.coupons%rowtype;
  v_coupon_code text:=nullif(upper(trim(coalesce(p_coupon_code,''))),'');
  v_coupon_discount numeric(18,2):=0;
  v_charge numeric(18,2);
  v_promo_account uuid;
  v_used integer;
begin
  if p_user_id is null or p_service_code not in ('airtime','data')
     or nullif(trim(p_network_code),'') is null
     or nullif(trim(p_recipient),'') is null
     or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'Invalid purchase details';
  end if;

  select * into v_order from public.service_orders
   where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then return v_order; end if;

  select * into v_profile from public.profiles where id=p_user_id;
  if not found or coalesce(v_profile.account_status,'active')<>'active' then
    raise exception 'Account is not eligible to purchase';
  end if;
  select * into v_category from public.service_categories where code=p_service_code and active;
  if not found then raise exception 'Service is unavailable'; end if;
  v_category_id:=v_category.id;

  if p_service_code='data' then
    select p.* into v_product from public.service_products p
    join public.service_providers sp on sp.id=p.provider_id
    where p.id=p_product_id and p.category_id=v_category_id
      and p.network_or_operator=p_network_code and p.active
      and sp.code='topupmate' and sp.status in ('active','degraded')
    for update of p;
    if not found or v_product.cost_price is null then raise exception 'Data plan is unavailable'; end if;
    v_face:=coalesce(v_product.face_value,v_product.cost_price);
    v_cost:=v_product.cost_price;
  else
    select o.* into v_option from public.provider_service_options o
    join public.service_providers sp on sp.id=o.provider_id
    where o.category_id=v_category_id and o.option_type='network'
      and o.option_code=p_network_code and o.active
      and sp.code='topupmate' and sp.status in ('active','degraded')
    for update of o;
    if not found then raise exception 'Airtime network is unavailable'; end if;
    v_face:=p_airtime_face_value;
    -- Match IyanjuPay: Airtime is sold at the face value entered by the
    -- customer. Admin controls the customer selling price through the
    -- account-specific airtime category pricing rule; no fabricated
    -- supplier discount factor is required from the provider options.
    if v_face is null or v_face<50 or v_face>200000 then
      raise exception 'Airtime amount must be between ₦50 and ₦200,000';
    end if;
    v_cost:=v_face;
  end if;

  select * into v_rule from public.pricing_rules r
   where r.active and r.account_type=coalesce(v_profile.account_type,'personal')
     and (r.product_id=p_product_id or (r.product_id is null and r.category_id=v_category_id))
     and (r.starts_at is null or r.starts_at<=now())
     and (r.ends_at is null or r.ends_at>now())
   order by (r.product_id is not null) desc,r.updated_at desc limit 1;

  if found then
    v_price:=coalesce(v_rule.fixed_selling_price,
      case when v_rule.markup_type='percentage'
        then round(v_cost*(1+v_rule.markup_value/100),2)
        else round(v_cost+v_rule.markup_value,2) end);
  elsif p_service_code='data' then
    v_price:=v_product.selling_price;
  else
    raise exception 'Airtime pricing has not been configured for this account';
  end if;
  if v_price is null or v_price<v_cost or v_price<=0 then
    raise exception 'Selling price is invalid or below supplier cost';
  end if;

  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code=v_coupon_code and active for update;
    if not found then raise exception 'This coupon is invalid or inactive'; end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at>now() then raise exception 'This coupon is not active yet'; end if;
    if v_coupon.ends_at is not null and v_coupon.ends_at<=now() then raise exception 'This coupon has expired'; end if;
    if v_price<v_coupon.min_order_amount then raise exception 'This purchase does not meet the coupon minimum order amount'; end if;
    select count(*) into v_used from public.coupon_redemptions where coupon_id=v_coupon.id and user_id=p_user_id and status in ('reserved','applied');
    if v_used>=v_coupon.per_user_limit then raise exception 'You have already used this coupon the maximum number of times'; end if;
    select count(*) into v_used from public.coupon_redemptions where coupon_id=v_coupon.id and status in ('reserved','applied');
    if v_coupon.total_redemption_limit is not null and v_used>=v_coupon.total_redemption_limit then raise exception 'This coupon has reached its redemption limit'; end if;
    if v_coupon.discount_type='percentage' then v_coupon_discount:=round(v_price*v_coupon.discount_value/100,2);
    else v_coupon_discount:=round(v_coupon.discount_value,2); end if;
    if v_coupon.max_discount is not null then v_coupon_discount:=least(v_coupon_discount,v_coupon.max_discount); end if;
    v_coupon_discount:=least(v_coupon_discount,v_price);
    if v_coupon.budget_amount is not null and v_coupon.budget_spent+v_coupon_discount>v_coupon.budget_amount then
      raise exception 'This coupon campaign has exhausted its discount budget';
    end if;
  end if;
  v_charge:=round(v_price-v_coupon_discount,2);
  if v_charge<=0 then raise exception 'Coupon discount cannot reduce the purchase to zero'; end if;

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found or v_wallet.wallet_status<>'active' then raise exception 'Wallet unavailable'; end if;
  if v_wallet.currency<>'NGN' or v_wallet.balance<v_charge then raise exception 'Insufficient wallet balance'; end if;

  v_request_id:='TRX'||upper(encode(gen_random_bytes(12),'hex'));
  insert into public.service_orders(user_id,category_id,product_id,provider_id,request_id,recipient,amount,currency,status,idempotency_key,service_metadata)
  values(p_user_id,v_category_id,case when p_service_code='data' then p_product_id else null end,
    (select id from public.service_providers where code='topupmate'),
    v_request_id,trim(p_recipient),v_charge,'NGN','pending',trim(p_idempotency_key),
    jsonb_build_object('original_amount',v_price,'coupon_code',v_coupon_code,
      'coupon_discount',v_coupon_discount,'coupon_id',case when v_coupon_code is not null then v_coupon.id::text else null end))
  returning * into v_order;

  update public.wallets set balance=balance-v_charge where user_id=p_user_id;
  select id into v_wallet_account from public.ledger_accounts where account_code='customer-wallet:'||p_user_id::text;
  select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
  if v_wallet_account is null or v_provider_account is null then raise exception 'Ledger accounts are not configured'; end if;

  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('service_order',v_order.id,'service-order:'||v_order.id::text,'Airtime/data purchase reservation')
  returning id into v_journal;
  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_wallet_account,'debit',v_charge,'NGN'),
        (v_journal,v_provider_account,'credit',v_price,'NGN');
  if v_coupon_discount>0 then
    insert into public.ledger_accounts(account_code,account_name,account_type,currency)
    values('platform:coupon-expense','Coupon promotion expense','expense','NGN')
    on conflict(account_code) do nothing;
    select id into v_promo_account from public.ledger_accounts where account_code='platform:coupon-expense' and currency='NGN';
    if v_promo_account is null then raise exception 'Coupon promotion ledger is not configured'; end if;
    insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
    values(v_journal,v_promo_account,'debit',v_coupon_discount,'NGN');
    update public.coupons set budget_spent=budget_spent+v_coupon_discount,updated_at=now() where id=v_coupon.id;
    insert into public.coupon_redemptions(coupon_id,user_id,service_order_id,discount_amount,status)
    values(v_coupon.id,p_user_id,v_order.id,v_coupon_discount,'reserved');
  end if;
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(p_user_id,v_charge,'debit','service_order',v_order.id,p_service_code||' purchase');
  return v_order;
exception when unique_violation then
  select * into v_order from public.service_orders
   where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then return v_order; end if;
  raise;
end;
$$;
