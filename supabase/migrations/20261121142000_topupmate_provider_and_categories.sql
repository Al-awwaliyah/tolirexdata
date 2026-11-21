-- Register Topupmate as the only active bill-payment supplier and restore service categories
-- removed during the earlier provider-neutral catalogue reset.
insert into public.service_categories(code,name,sort_order) values
 ('airtime','Airtime',10),
 ('data','Mobile data',20),
 ('cable_tv','Cable TV',30),
 ('electricity','Electricity',40),
 ('recharge_pin','Recharge PINs',50),
 ('education','Education PINs',60),
 ('data_pin','Data PINs',70),
 ('internet','Internet services',80),
 ('gift_card','Gift Cards',90)
on conflict(code) do update set active=true;

insert into public.service_providers(code,name,status,priority,supports_airtime,supports_data,supports_cable,supports_electricity,supports_epin)
values('topupmate','Topupmate','disabled',10,true,true,true,true,true)
on conflict(code) do update set
 name=excluded.name,supports_airtime=true,supports_data=true,supports_cable=true,
 supports_electricity=true,supports_epin=true,updated_at=now();

-- Keep the abandoned supplier disabled; customer catalogue queries require an enabled provider.
update public.service_providers set status='disabled',updated_at=now() where code='clubkonnect';

-- Replace the legacy reservation function's provider binding without changing its
-- server-derived price, idempotency, wallet and balanced-ledger safeguards.
create or replace function public.reserve_catalogue_service_order(
  p_user_id uuid,
  p_service_code text,
  p_product_id uuid,
  p_network_code text,
  p_recipient text,
  p_airtime_face_value numeric,
  p_idempotency_key text
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
      and p.network_or_operator=p_network_code
      and p.active and p.publication_status='published'
      and sp.code='topupmate' and sp.status in ('active','degraded')
    for update of p;
    if not found or v_product.cost_price is null then raise exception 'Data plan is unavailable'; end if;
    v_face:=coalesce(v_product.face_value,v_product.cost_price);
    v_cost:=v_product.cost_price;
  else
    select o.* into v_option from public.provider_service_options o
    join public.service_providers sp on sp.id=o.provider_id
    where o.category_id=v_category_id and o.option_type='network'
      and o.option_code=p_network_code and o.active and o.publication_status='published'
      and sp.code='topupmate' and sp.status in ('active','degraded')
    for update of o;
    if not found then raise exception 'Airtime network is unavailable'; end if;
    v_face:=p_airtime_face_value;
    v_min:=nullif(v_option.metadata->>'minimum_amount','')::numeric;
    v_max:=nullif(v_option.metadata->>'maximum_amount','')::numeric;
    v_discount:=nullif(v_option.metadata->>'discount_factor','')::numeric;
    if v_face is null or v_face<=0 or (v_min is not null and v_face<v_min)
       or (v_max is not null and v_face>v_max) or v_discount is null
       or v_discount<=0 or v_discount>1 then
      raise exception 'Airtime amount or supplier pricing is unavailable';
    end if;
    v_cost:=round(v_face*v_discount,2);
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

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found or v_wallet.wallet_status<>'active' then raise exception 'Wallet unavailable'; end if;
  if v_wallet.currency<>'NGN' or v_wallet.balance<v_price then raise exception 'Insufficient wallet balance'; end if;

  v_request_id:='TRX'||upper(encode(gen_random_bytes(12),'hex'));
  insert into public.service_orders(user_id,category_id,product_id,provider_id,request_id,recipient,amount,currency,status,idempotency_key)
  values(p_user_id,v_category_id,case when p_service_code='data' then p_product_id else null end,
    (select id from public.service_providers where code='topupmate'),
    v_request_id,trim(p_recipient),v_price,'NGN','pending',trim(p_idempotency_key))
  returning * into v_order;

  update public.wallets set balance=balance-v_price where user_id=p_user_id;
  select id into v_wallet_account from public.ledger_accounts where account_code='customer-wallet:'||p_user_id::text;
  select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
  if v_wallet_account is null or v_provider_account is null then raise exception 'Ledger accounts are not configured'; end if;

  insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
  values('service_order',v_order.id,'service-order:'||v_order.id::text,'Airtime/data purchase reservation')
  returning id into v_journal;
  insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount,currency)
  values(v_journal,v_wallet_account,'debit',v_price,'NGN'),
        (v_journal,v_provider_account,'credit',v_price,'NGN');
  insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
  values(p_user_id,v_price,'debit','service_order',v_order.id,p_service_code||' purchase');
  return v_order;
exception when unique_violation then
  select * into v_order from public.service_orders
   where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then return v_order; end if;
  raise;
end;
$$;


