-- Backfill the live Topupmate field "plantype" from the saved data catalogue.
-- This is deliberately a new migration: earlier catalogue migrations are already applied.
with source_plans as (
  select entry.item
  from public.provider_catalogue_snapshots s
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(s.payload->'response') = 'array' then s.payload->'response'
      else '[]'::jsonb
    end
  ) as entry(item)
  where s.provider_code='topupmate'
    and s.catalogue_key='services:data'
    and s.fetch_status='success'
),
normalized as (
  select
    nullif(btrim(item->>'planid'),'') as supplier_plan_id,
    nullif(btrim(item->>'plantype'),'') as raw_plan_type,
    nullif(btrim(item->>'networkid'),'') as network_id,
    nullif(btrim(item->>'network'),'') as raw_network
  from source_plans
)
update public.service_products p
set
  metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object(
    'topupmate_plan_type',n.raw_plan_type,
    'plan_type',case
      when lower(regexp_replace(coalesce(n.raw_plan_type,''),'[^a-z]','','g')) like '%sme%' then 'sme'
      when lower(regexp_replace(coalesce(n.raw_plan_type,''),'[^a-z]','','g')) like '%gift%' then 'gifting'
      when lower(regexp_replace(coalesce(n.raw_plan_type,''),'[^a-z]','','g')) like '%corporate%' then 'corporate'
      else null
    end,
    'topupmate_network_id',n.network_id,
    'topupmate_raw_network',n.raw_network
  ),
  plan_type=case
    when lower(regexp_replace(coalesce(n.raw_plan_type,''),'[^a-z]','','g')) like '%sme%' then 'sme'
    when lower(regexp_replace(coalesce(n.raw_plan_type,''),'[^a-z]','','g')) like '%gift%' then 'gifting'
    when lower(regexp_replace(coalesce(n.raw_plan_type,''),'[^a-z]','','g')) like '%corporate%' then 'corporate'
    else null
  end,
  network_or_operator=coalesce(n.network_id,p.network_or_operator),
  updated_at=now()
from normalized n, public.service_categories c
where p.category_id=c.id
  and c.code='data'
  and p.provider_product_code='data:'||n.supplier_plan_id;

-- Reaffirm automatic supplier availability for successfully imported options/products.
update public.service_products p
set active=true,publication_status='published',reviewed_by=null,reviewed_at=null,updated_at=now()
from public.service_providers sp
where sp.id=p.provider_id and sp.code='topupmate' and p.supplier_last_seen_at is not null;
update public.provider_service_options o
set active=true,publication_status='published',reviewed_by=null,reviewed_at=null,updated_at=now()
from public.service_providers sp
where sp.id=o.provider_id and sp.code='topupmate' and o.supplier_last_seen_at is not null;
