-- TolirexData supplier-driven catalogue: no per-product or per-option publication.
-- Topupmate is the source of catalogue availability; Admin manages selling prices only.

create or replace function public.sync_provider_catalogue_product(
  p_provider_code text,
  p_category_code text,
  p_product_code text,
  p_name text,
  p_network_or_operator text,
  p_description text,
  p_face_value numeric,
  p_cost_price numeric,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_provider_id uuid; v_category_id uuid; v_product_id uuid;
begin
  if nullif(trim(p_product_code),'') is null or nullif(trim(p_name),'') is null
     or p_cost_price is null or p_cost_price < 0 then
    raise exception 'Invalid normalized supplier product';
  end if;
  select id into v_provider_id from public.service_providers where code=p_provider_code;
  select id into v_category_id from public.service_categories where code=p_category_code;
  if v_provider_id is null or v_category_id is null then
    raise exception 'Supplier or service category is not registered';
  end if;

  insert into public.service_products(
    category_id,provider_id,provider_product_code,name,network_or_operator,
    description,face_value,cost_price,selling_price,currency,metadata,
    active,publication_status,supplier_last_seen_at
  ) values (
    v_category_id,v_provider_id,trim(p_product_code),trim(p_name),
    nullif(trim(p_network_or_operator),''),nullif(trim(p_description),''),
    p_face_value,p_cost_price,p_cost_price,'NGN',coalesce(p_metadata,'{}'::jsonb),
    true,'published',now()
  )
  on conflict(provider_id,provider_product_code) do update set
    category_id=excluded.category_id,
    name=excluded.name,
    network_or_operator=excluded.network_or_operator,
    description=excluded.description,
    face_value=excluded.face_value,
    cost_price=excluded.cost_price,
    metadata=excluded.metadata,
    active=true,
    publication_status='published',
    reviewed_by=null,
    reviewed_at=null,
    supplier_last_seen_at=now(),
    updated_at=now()
  returning id into v_product_id;
  return v_product_id;
end;
$$;
revoke all on function public.sync_provider_catalogue_product(text,text,text,text,text,text,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.sync_provider_catalogue_product(text,text,text,text,text,text,numeric,numeric,jsonb) to service_role;

create or replace function public.sync_provider_service_option(
  p_provider_code text,
  p_category_code text,
  p_option_type text,
  p_option_code text,
  p_name text,
  p_parent_option_code text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_provider_id uuid; v_category_id uuid; v_id uuid;
begin
  if nullif(trim(p_option_code),'') is null or nullif(trim(p_name),'') is null then
    raise exception 'Invalid supplier service option';
  end if;
  select id into v_provider_id from public.service_providers where code=p_provider_code;
  select id into v_category_id from public.service_categories where code=p_category_code;
  if v_provider_id is null or v_category_id is null then
    raise exception 'Supplier or service category is not registered';
  end if;
  insert into public.provider_service_options(
    provider_id,category_id,option_type,option_code,parent_option_code,name,metadata,
    active,publication_status
  ) values (
    v_provider_id,v_category_id,p_option_type,trim(p_option_code),
    nullif(trim(p_parent_option_code),''),trim(p_name),coalesce(p_metadata,'{}'::jsonb),
    true,'published'
  )
  on conflict(provider_id,category_id,option_type,option_code) do update set
    parent_option_code=excluded.parent_option_code,
    name=excluded.name,
    metadata=excluded.metadata || (
      case when provider_service_options.metadata ? 'pricing_verified_at' then
        jsonb_build_object(
          'discount_factor',provider_service_options.metadata->'discount_factor',
          'minimum_amount',provider_service_options.metadata->'minimum_amount',
          'maximum_amount',provider_service_options.metadata->'maximum_amount',
          'pricing_verified_by',provider_service_options.metadata->'pricing_verified_by',
          'pricing_verified_at',provider_service_options.metadata->'pricing_verified_at'
        )
      else '{}'::jsonb end
    ),
    active=true,
    publication_status='published',
    reviewed_by=null,
    reviewed_at=null,
    supplier_last_seen_at=now(),
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.sync_provider_service_option(text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_provider_service_option(text,text,text,text,text,text,jsonb) to service_role;

create or replace view public.public_service_catalog with (security_barrier=true) as
select
  p.id,p.category_id,c.code as category_code,c.name as category_name,
  p.name,p.network_or_operator,p.description,p.face_value,
  coalesce(
    case
      when pr.fixed_selling_price is not null then pr.fixed_selling_price
      when pr.markup_type='percentage' then round(p.cost_price*(1+pr.markup_value/100),2)
      else round(p.cost_price+pr.markup_value,2)
    end,
    p.selling_price
  )::numeric(18,2) as selling_price,
  p.currency,p.sort_order,p.plan_type
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
where p.active=true and c.active=true and sp.status in ('active','degraded');
grant select on public.public_service_catalog to anon,authenticated,service_role;

create or replace view public.public_service_options with (security_barrier=true) as
select o.id,c.code as category_code,o.option_type,o.option_code,o.parent_option_code,o.name
from public.provider_service_options o
join public.service_categories c on c.id=o.category_id
join public.service_providers sp on sp.id=o.provider_id
where o.active=true and c.active=true and sp.status in ('active','degraded');
grant select on public.public_service_options to anon,authenticated,service_role;

comment on view public.public_service_catalog is
  'Customer-safe supplier-driven catalogue. No Admin publication gate; Admin-managed pricing remains account-specific.';
comment on view public.public_service_options is
  'Customer-safe supplier-derived service providers/options. No per-option publication gate.';
