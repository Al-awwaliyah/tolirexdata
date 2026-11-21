-- Admin-controlled catalogue publication and account-specific prices.
-- Customers only see published products from an enabled provider.

create or replace view public.public_service_catalog with (security_barrier=true) as
select
  p.id,
  p.category_id,
  c.code as category_code,
  c.name as category_name,
  p.name,
  p.network_or_operator,
  p.description,
  p.face_value,
  coalesce(
    case
      when pr.fixed_selling_price is not null then pr.fixed_selling_price
      when pr.markup_type='percentage' then round(p.cost_price * (1 + pr.markup_value / 100),2)
      else round(p.cost_price + pr.markup_value,2)
    end,
    p.selling_price
  ) as selling_price,
  p.currency,
  p.sort_order
from public.service_products p
join public.service_categories c on c.id=p.category_id
join public.service_providers sp on sp.id=p.provider_id
left join public.profiles profile on profile.id=auth.uid()
left join lateral (
  select r.fixed_selling_price,r.markup_type,r.markup_value
  from public.pricing_rules r
  where r.active
    and (r.product_id=p.id or (r.product_id is null and r.category_id=p.category_id))
    and r.account_type=coalesce(profile.account_type,'personal')
    and (r.starts_at is null or r.starts_at<=now())
    and (r.ends_at is null or r.ends_at>now())
  order by (r.product_id is not null) desc,r.updated_at desc
  limit 1
) pr on true
where p.active=true
  and p.publication_status='published'
  and c.active=true
  and sp.status in ('active','degraded');

grant select on public.public_service_catalog to anon,authenticated,service_role;

with ranked as (
  select ctid,row_number() over(partition by product_id,account_type order by updated_at desc,created_at desc) as rn
  from public.pricing_rules where product_id is not null
)
delete from public.pricing_rules r using ranked x where r.ctid=x.ctid and x.rn>1;
create unique index if not exists pricing_rules_product_account_uidx
  on public.pricing_rules(product_id,account_type) where product_id is not null;

create or replace function public.admin_set_service_product_publication(
  p_product_id uuid,
  p_publication_status text,
  p_personal_price numeric default null,
  p_agent_price numeric default null,
  p_business_price numeric default null
) returns public.service_products
language plpgsql security definer set search_path=public as $$
declare v_product public.service_products%rowtype; v_actor uuid:=auth.uid(); v_before jsonb;
begin
  if v_actor is null or not public.has_admin_permission('services.manage')
     or not public.has_admin_permission('pricing.manage') then
    raise exception 'Service and pricing administrator permissions are required';
  end if;
  if p_publication_status not in ('published','paused','rejected') then
    raise exception 'Invalid publication status';
  end if;
  select * into v_product from public.service_products where id=p_product_id for update;
  if not found then raise exception 'Catalogue product not found'; end if;

  v_before:=jsonb_build_object('active',v_product.active,'publication_status',v_product.publication_status,'selling_price',v_product.selling_price);

  if p_publication_status='published' then
    if p_personal_price is null or p_agent_price is null or p_business_price is null
       or least(p_personal_price,p_agent_price,p_business_price)<v_product.cost_price then
      raise exception 'All account prices must be provided and must not be below supplier cost';
    end if;

    update public.service_products set
      selling_price=p_personal_price,
      active=true,
      publication_status='published',
      reviewed_by=v_actor,
      reviewed_at=now(),
      updated_at=now()
    where id=p_product_id returning * into v_product;

    insert into public.pricing_rules(product_id,account_type,markup_type,markup_value,fixed_selling_price,active)
    values
      (p_product_id,'agent','fixed',0,p_agent_price,true),
      (p_product_id,'business','fixed',0,p_business_price,true)
    on conflict(product_id,account_type) where product_id is not null do update set
      markup_type='fixed',markup_value=0,fixed_selling_price=excluded.fixed_selling_price,active=true,
      starts_at=null,ends_at=null,updated_at=now();

    update public.pricing_rules set
      markup_type='fixed',markup_value=0,fixed_selling_price=p_agent_price,active=true,
      starts_at=null,ends_at=null,updated_at=now()
    where product_id=p_product_id and account_type='agent';

    update public.pricing_rules set
      markup_type='fixed',markup_value=0,fixed_selling_price=p_business_price,active=true,
      starts_at=null,ends_at=null,updated_at=now()
    where product_id=p_product_id and account_type='business';
  else
    update public.service_products set
      active=false,
      publication_status=p_publication_status,
      reviewed_by=v_actor,
      reviewed_at=now(),
      updated_at=now()
    where id=p_product_id returning * into v_product;
    update public.pricing_rules set active=false,updated_at=now() where product_id=p_product_id;
  end if;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,before_data,after_data)
  values(v_actor,'catalogue.product.'||p_publication_status,'service_product',p_product_id::text,
    v_before,
    jsonb_build_object('active',v_product.active,'publication_status',v_product.publication_status,
      'personal_price',v_product.selling_price,'agent_price',p_agent_price,'business_price',p_business_price));
  return v_product;
end;
$$;
revoke all on function public.admin_set_service_product_publication(uuid,text,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_set_service_product_publication(uuid,text,numeric,numeric,numeric) to authenticated;

comment on view public.public_service_catalog is
  'Customer-safe catalogue: published active products only; account-specific selling price; never includes supplier cost or raw provider metadata.';
