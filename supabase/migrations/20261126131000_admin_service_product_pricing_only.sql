-- Existing Topupmate catalogue records become visible from supplier sync state.
update public.service_products p
set active=true, publication_status='published', reviewed_by=null, reviewed_at=null, updated_at=now()
from public.service_providers sp
where sp.id=p.provider_id and sp.code='topupmate'
  and p.supplier_last_seen_at is not null;

update public.provider_service_options o
set active=true, publication_status='published', reviewed_by=null, reviewed_at=null, updated_at=now()
from public.service_providers sp
where sp.id=o.provider_id and sp.code='topupmate'
  and o.supplier_last_seen_at is not null;

create or replace function public.admin_set_service_product_prices(
  p_product_id uuid,
  p_personal_price numeric,
  p_agent_price numeric,
  p_business_price numeric
) returns public.service_products
language plpgsql security definer set search_path=public as $$
declare
  v_product public.service_products%rowtype;
  v_actor uuid:=auth.uid();
  v_before jsonb;
begin
  if v_actor is null or not public.has_admin_permission('pricing.manage') then
    raise exception 'Pricing management permission is required';
  end if;
  if p_personal_price is null or p_agent_price is null or p_business_price is null
     or least(p_personal_price,p_agent_price,p_business_price)<0 then
    raise exception 'Enter valid selling prices for all account types';
  end if;
  select * into v_product from public.service_products where id=p_product_id for update;
  if not found then raise exception 'Catalogue product not found'; end if;
  if least(p_personal_price,p_agent_price,p_business_price)<v_product.cost_price then
    raise exception 'Selling prices cannot be below supplier cost';
  end if;
  v_before:=jsonb_build_object('personal_price',v_product.selling_price);
  update public.service_products
    set selling_price=p_personal_price,active=true,publication_status='published',updated_at=now()
    where id=p_product_id returning * into v_product;

  insert into public.pricing_rules(product_id,account_type,markup_type,markup_value,fixed_selling_price,active)
  values
    (p_product_id,'agent','fixed',0,p_agent_price,true),
    (p_product_id,'business','fixed',0,p_business_price,true)
  on conflict(product_id,account_type) where product_id is not null do update set
    markup_type='fixed',markup_value=0,fixed_selling_price=excluded.fixed_selling_price,
    active=true,starts_at=null,ends_at=null,updated_at=now();

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,before_data,after_data)
  values(v_actor,'service_product.pricing.updated','service_product',p_product_id::text,
    v_before,jsonb_build_object('personal_price',p_personal_price,'agent_price',p_agent_price,'business_price',p_business_price));
  return v_product;
end;
$$;
revoke all on function public.admin_set_service_product_prices(uuid,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_set_service_product_prices(uuid,numeric,numeric,numeric) to authenticated;
