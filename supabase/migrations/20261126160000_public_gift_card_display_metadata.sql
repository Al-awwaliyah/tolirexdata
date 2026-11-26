-- Expose only safe gift-card display metadata needed by the IyanjuPay-style
-- customer catalogue. Supplier credentials/costs and raw metadata remain private.
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
  p.currency,p.sort_order,p.plan_type,
  p.metadata->>'country_code' as country_code,
  p.metadata->>'product_category' as product_category,
  p.metadata->>'recipient_currency' as recipient_currency,
  p.metadata->>'logo_url' as logo_url,
  p.metadata->'redeem_instruction' as redeem_instruction
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
