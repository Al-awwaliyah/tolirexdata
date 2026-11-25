-- Classify published Topupmate data plans so customers browse by network and plan type.
alter table public.service_products add column if not exists plan_type text;
alter table public.service_products drop constraint if exists service_products_plan_type_check;
alter table public.service_products add constraint service_products_plan_type_check
  check (plan_type is null or plan_type in ('sme','gifting','corporate'));

create or replace view public.public_service_catalog with (security_barrier=true) as
select
  p.id,p.category_id,c.code as category_code,c.name as category_name,
  p.name,p.network_or_operator,p.description,p.face_value,p.plan_type,
  coalesce(
    case
      when pr.fixed_selling_price is not null then pr.fixed_selling_price
      when pr.markup_type='percentage' then round(p.cost_price*(1+pr.markup_value/100),2)
      else round(p.cost_price+pr.markup_value,2)
    end,p.selling_price
  )::numeric(18,2) as selling_price,
  p.currency,p.sort_order
from public.service_products p
join public.service_categories c on c.id=p.category_id
join public.service_providers sp on sp.id=p.provider_id
left join public.profiles profile on profile.id=auth.uid()
left join lateral (
  select r.fixed_selling_price,r.markup_type,r.markup_value
  from public.pricing_rules r
  where r.active and (r.product_id=p.id or (r.product_id is null and r.category_id=p.category_id))
    and r.account_type=coalesce(profile.account_type,'personal')
    and (r.starts_at is null or r.starts_at<=now()) and (r.ends_at is null or r.ends_at>now())
  order by (r.product_id is not null) desc,r.updated_at desc limit 1
) pr on true
where p.active=true and p.publication_status='published' and c.active=true
  and sp.status in ('active','degraded');

create or replace function public.admin_set_data_plan_type(p_product_id uuid,p_plan_type text)
returns public.service_products language plpgsql security definer set search_path=public as $$
declare v_product public.service_products%rowtype; v_actor uuid:=auth.uid();
begin
 if v_actor is null or not public.has_admin_permission('services.manage') then raise exception 'Service management permission required'; end if;
 if p_plan_type not in ('sme','gifting','corporate') then raise exception 'Invalid data plan type'; end if;
 update public.service_products p set plan_type=p_plan_type,updated_at=now()
 from public.service_categories c where p.id=p_product_id and p.category_id=c.id and c.code='data'
 returning p.* into v_product;
 if not found then raise exception 'Data plan not found'; end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,after_data)
 values(v_actor,'catalogue.data_plan_type.updated','service_product',p_product_id::text,jsonb_build_object('plan_type',p_plan_type));
 return v_product;
end; $$;
revoke all on function public.admin_set_data_plan_type(uuid,text) from public,anon;
grant execute on function public.admin_set_data_plan_type(uuid,text) to authenticated;
