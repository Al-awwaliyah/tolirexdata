-- Derive customer data-plan classification from Topupmate catalogue metadata.
-- No Admin-entered plan type is required.
create or replace function public.apply_supplier_plan_classification()
returns trigger language plpgsql set search_path=public as $$
declare v_type text;
begin
  if exists(select 1 from public.service_categories c where c.id=new.category_id and c.code='data') then
    v_type:=lower(regexp_replace(coalesce(new.metadata->>'plan_type',new.metadata->>'topupmate_plan_type',''),'[^a-z]','','g'));
    new.plan_type:=case
      when v_type like '%sme%' then 'sme'
      when v_type like '%gift%' then 'gifting'
      when v_type like '%corporate%' then 'corporate'
      else null
    end;
  else
    new.plan_type:=null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_apply_supplier_plan_classification on public.service_products;
create trigger trg_apply_supplier_plan_classification
before insert or update of category_id,metadata on public.service_products
for each row execute function public.apply_supplier_plan_classification();

-- Backfill existing Topupmate data rows from the supplier metadata already synced.
update public.service_products p
set plan_type=case
  when lower(regexp_replace(coalesce(p.metadata->>'plan_type',p.metadata->>'topupmate_plan_type',''),'[^a-z]','','g')) like '%sme%' then 'sme'
  when lower(regexp_replace(coalesce(p.metadata->>'plan_type',p.metadata->>'topupmate_plan_type',''),'[^a-z]','','g')) like '%gift%' then 'gifting'
  when lower(regexp_replace(coalesce(p.metadata->>'plan_type',p.metadata->>'topupmate_plan_type',''),'[^a-z]','','g')) like '%corporate%' then 'corporate'
  else null end
from public.service_categories c
where p.category_id=c.id and c.code='data' and p.provider_product_code like 'data:%';

drop function if exists public.admin_set_data_plan_type(uuid,text);
