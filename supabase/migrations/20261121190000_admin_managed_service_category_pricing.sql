-- Admin-managed electricity service fees/markups for amount-based meter payments.
create unique index if not exists pricing_rules_category_account_uidx
  on public.pricing_rules(category_id,account_type)
  where product_id is null;

create or replace function public.admin_set_service_category_markup(
  p_category_code text,p_account_type text,p_markup_type text,p_markup_value numeric
) returns public.pricing_rules
language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid:=auth.uid();
  v_category_id uuid;
  v_rule public.pricing_rules%rowtype;
  v_before jsonb;
begin
  if v_actor is null or not public.has_admin_permission('pricing.manage') then
    raise exception 'Pricing management permission is required';
  end if;
  if p_account_type not in ('personal','agent','business')
     or p_markup_type not in ('fixed','percentage')
     or p_markup_value is null or p_markup_value<0
     or (p_markup_type='percentage' and p_markup_value>100) then
    raise exception 'Invalid service category pricing';
  end if;
  select id into v_category_id from public.service_categories where code=p_category_code and active;
  if v_category_id is null then raise exception 'Service category is unavailable'; end if;
  select * into v_rule from public.pricing_rules
    where category_id=v_category_id and product_id is null and account_type=p_account_type
    for update;
  if found then v_before:=to_jsonb(v_rule); end if;
  insert into public.pricing_rules(category_id,product_id,account_type,markup_type,markup_value,fixed_selling_price,active,starts_at,ends_at)
  values(v_category_id,null,p_account_type,p_markup_type,p_markup_value,null,true,null,null)
  on conflict(category_id,account_type) where product_id is null do update set
    markup_type=excluded.markup_type,markup_value=excluded.markup_value,
    fixed_selling_price=null,active=true,starts_at=null,ends_at=null,updated_at=now()
  returning * into v_rule;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,before_data,after_data)
  values(v_actor,'service_category.pricing.updated','service_category_pricing',
    p_category_code||':'||p_account_type,coalesce(v_before,'{}'::jsonb),
    jsonb_build_object('category_code',p_category_code,'account_type',p_account_type,
      'markup_type',v_rule.markup_type,'markup_value',v_rule.markup_value,'active',v_rule.active));
  return v_rule;
end;
$$;
revoke all on function public.admin_set_service_category_markup(text,text,text,numeric) from public,anon;
grant execute on function public.admin_set_service_category_markup(text,text,text,numeric) to authenticated;
