-- Backfill Topupmate data-plan classifications from the supplier's saved catalogue.
-- The live Topupmate response uses the exact field name "plantype" (not "plan_type").
-- Preserve the raw supplier value; only map the three supported customer plan groups.
with source_plans as (
  select rows.item
  from public.provider_catalogue_snapshots s
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(s.payload->'response') = 'array' then s.payload->'response'
      else '[]'::jsonb
    end
  ) as rows(item)
  where s.provider_code = 'topupmate'
    and s.catalogue_key = 'services:data'
    and s.fetch_status = 'success'
),
normalized as (
  select
    nullif(btrim(item->>'planid'), '') as supplier_plan_id,
    nullif(btrim(item->>'plantype'), '') as raw_plan_type,
    nullif(btrim(item->>'networkid'), '') as network_id,
    nullif(btrim(item->>'network'), '') as raw_network
  from source_plans
)
update public.service_products as p
set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
  'topupmate_plan_type', n.raw_plan_type,
  'plan_type', case
    when lower(regexp_replace(coalesce(n.raw_plan_type, ''), '[^a-z]', '', 'g')) like '%sme%' then 'sme'
    when lower(regexp_replace(coalesce(n.raw_plan_type, ''), '[^a-z]', '', 'g')) like '%gift%' then 'gifting'
    when lower(regexp_replace(coalesce(n.raw_plan_type, ''), '[^a-z]', '', 'g')) like '%corporate%' then 'corporate'
    else null
  end,
  'topupmate_network_id', n.network_id,
  'topupmate_raw_network', n.raw_network
)
from normalized as n, public.service_categories as c
where c.id = p.category_id
  and c.code = 'data'
  and p.provider_product_code = 'data:' || n.supplier_plan_id
  and n.supplier_plan_id is not null;

-- The existing service-product trigger derives plan_type from the normalized metadata.
