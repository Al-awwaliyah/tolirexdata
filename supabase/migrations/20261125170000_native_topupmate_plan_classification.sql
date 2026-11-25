-- Treat Topupmate's own catalogue fields as the source of data plan classification.
-- IyanjuPay's production parser reads plan_type / planType / type from supplier rows.
create or replace function public.derive_topupmate_data_plan_type()
returns trigger language plpgsql set search_path=public as $$
declare v_raw text; v_norm text;
begin
 if new.metadata->>'source_service'='data' then
   v_raw:=coalesce(nullif(new.metadata->>'topupmate_plan_type',''),nullif(new.metadata->>'plan_type',''));
   v_norm:=regexp_replace(lower(coalesce(v_raw,'')),'[^a-z]','','g');
   if v_norm like '%sme%' then new.plan_type:='sme';
   elsif v_norm like '%gift%' then new.plan_type:='gifting';
   elsif v_norm like '%corporate%' then new.plan_type:='corporate';
   else new.plan_type:=null;
   end if;
 end if;
 return new;
end; $$;
drop trigger if exists trg_derive_topupmate_data_plan_type on public.service_products;
create trigger trg_derive_topupmate_data_plan_type
before insert or update of metadata,category_id on public.service_products
for each row execute function public.derive_topupmate_data_plan_type();

update public.service_products
set plan_type=case
 when regexp_replace(lower(coalesce(metadata->>'topupmate_plan_type',metadata->>'plan_type','')),'[^a-z]','','g') like '%sme%' then 'sme'
 when regexp_replace(lower(coalesce(metadata->>'topupmate_plan_type',metadata->>'plan_type','')),'[^a-z]','','g') like '%gift%' then 'gifting'
 when regexp_replace(lower(coalesce(metadata->>'topupmate_plan_type',metadata->>'plan_type','')),'[^a-z]','','g') like '%corporate%' then 'corporate'
 else null end
where metadata->>'source_service'='data';

-- Admin no longer classifies plans; the provider's plan_type is imported on every sync.
drop function if exists public.admin_set_data_plan_type(uuid,text);
