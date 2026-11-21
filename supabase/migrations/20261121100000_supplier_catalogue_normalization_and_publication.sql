-- TolirexData: supplier catalogue normalization and controlled publication.
-- Raw provider payloads remain private. Newly discovered records are never customer-visible
-- until an authorized administrator publishes them and configures a selling price.

create unique index if not exists service_products_provider_code_uidx
  on public.service_products(provider_id, provider_product_code);

drop index if exists public.service_products_provider_product_code_uidx;

alter table public.service_products
  add column if not exists publication_status text not null default 'pending'
    check (publication_status in ('pending','published','rejected','paused')),
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists supplier_last_seen_at timestamptz;

create table if not exists public.provider_service_options (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  category_id uuid not null references public.service_categories(id) on delete restrict,
  option_type text not null check (option_type in ('network','operator','cable_provider','meter_type')),
  option_code text not null,
  parent_option_code text,
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  publication_status text not null default 'pending'
    check (publication_status in ('pending','published','rejected','paused')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  supplier_last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id,category_id,option_type,option_code)
);
create index if not exists provider_service_options_public_idx
  on public.provider_service_options(category_id,option_type,active,name);

alter table public.provider_service_options enable row level security;
revoke all on public.provider_service_options from anon, authenticated;
grant all on public.provider_service_options to service_role;

create table if not exists public.provider_catalogue_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete restrict,
  triggered_by uuid references auth.users(id),
  trigger_source text not null default 'admin',
  status text not null check(status in ('running','success','partial','failed')),
  discovered_products integer not null default 0,
  discovered_options integer not null default 0,
  inserted_products integer not null default 0,
  updated_products integer not null default 0,
  failed_endpoints jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.provider_catalogue_sync_runs enable row level security;
revoke all on public.provider_catalogue_sync_runs from anon, authenticated;
grant all on public.provider_catalogue_sync_runs to service_role;

-- Called only by the server-side catalogue importer. Preserve admin publication and
-- pricing on subsequent syncs; supplier refreshes may update supplier facts only.
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
    false,'pending',now()
  )
  on conflict(provider_id,provider_product_code) do update set
    category_id=excluded.category_id,
    name=excluded.name,
    network_or_operator=excluded.network_or_operator,
    description=excluded.description,
    face_value=excluded.face_value,
    cost_price=excluded.cost_price,
    metadata=excluded.metadata,
    active=case
      when service_products.selling_price < excluded.cost_price
        or exists (
          select 1 from public.pricing_rules r
          where r.product_id=service_products.id and r.active
            and coalesce(r.fixed_selling_price,service_products.selling_price)<excluded.cost_price
        ) then false
      else service_products.active
    end,
    publication_status=case
      when service_products.selling_price < excluded.cost_price
        or exists (
          select 1 from public.pricing_rules r
          where r.product_id=service_products.id and r.active
            and coalesce(r.fixed_selling_price,service_products.selling_price)<excluded.cost_price
        ) then 'pending'
      else service_products.publication_status
    end,
    reviewed_by=case
      when service_products.selling_price < excluded.cost_price
        or exists (
          select 1 from public.pricing_rules r
          where r.product_id=service_products.id and r.active
            and coalesce(r.fixed_selling_price,service_products.selling_price)<excluded.cost_price
        ) then null
      else service_products.reviewed_by
    end,
    reviewed_at=case
      when service_products.selling_price < excluded.cost_price
        or exists (
          select 1 from public.pricing_rules r
          where r.product_id=service_products.id and r.active
            and coalesce(r.fixed_selling_price,service_products.selling_price)<excluded.cost_price
        ) then null
      else service_products.reviewed_at
    end,
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
    provider_id,category_id,option_type,option_code,parent_option_code,name,metadata
  ) values (
    v_provider_id,v_category_id,p_option_type,trim(p_option_code),
    nullif(trim(p_parent_option_code),''),trim(p_name),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(provider_id,category_id,option_type,option_code) do update set
    parent_option_code=excluded.parent_option_code,
    name=excluded.name,
    metadata=excluded.metadata,
    supplier_last_seen_at=now(),
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.sync_provider_service_option(text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_provider_service_option(text,text,text,text,text,text,jsonb) to service_role;

create or replace view public.public_service_options with (security_barrier=true) as
select o.id,c.code as category_code,o.option_type,o.option_code,o.parent_option_code,o.name
from public.provider_service_options o
join public.service_categories c on c.id=o.category_id
join public.service_providers sp on sp.id=o.provider_id
where o.active=true and o.publication_status='published'
  and c.active=true and sp.status in ('active','degraded');
grant select on public.public_service_options to anon,authenticated,service_role;

comment on table public.provider_service_options is
  'Private supplier-derived network, operator, cable-provider and meter-type options; publish explicitly through Admin.';
comment on column public.service_products.cost_price is
  'Private supplier cost. Never expose through customer catalogue projections.';
comment on column public.service_products.publication_status is
  'Admin review state. Supplier sync never publishes a product or changes its customer price.';


create or replace function public.admin_set_service_option_publication(
  p_option_id uuid,
  p_publication_status text
) returns public.provider_service_options
language plpgsql security definer set search_path=public as $$
declare v_option public.provider_service_options%rowtype; v_before jsonb; v_actor uuid:=auth.uid();
begin
  if v_actor is null or not public.has_admin_permission('services.manage') then
    raise exception 'Service management permission is required';
  end if;
  if p_publication_status not in ('published','paused','rejected') then
    raise exception 'Invalid option publication status';
  end if;
  select * into v_option from public.provider_service_options where id=p_option_id for update;
  if not found then raise exception 'Supplier option not found'; end if;
  v_before:=jsonb_build_object('active',v_option.active,'publication_status',v_option.publication_status);
  update public.provider_service_options set
    active=(p_publication_status='published'),
    publication_status=p_publication_status,
    reviewed_by=v_actor,reviewed_at=now(),updated_at=now()
  where id=p_option_id returning * into v_option;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,before_data,after_data)
  values(v_actor,'catalogue.option.'||p_publication_status,'provider_service_option',p_option_id::text,
    v_before,jsonb_build_object('active',v_option.active,'publication_status',v_option.publication_status,
      'option_type',v_option.option_type,'option_code',v_option.option_code));
  return v_option;
end;
$$;
revoke all on function public.admin_set_service_option_publication(uuid,text) from public,anon;
grant execute on function public.admin_set_service_option_publication(uuid,text) to authenticated;
