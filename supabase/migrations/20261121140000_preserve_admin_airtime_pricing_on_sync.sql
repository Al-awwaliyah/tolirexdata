-- Preserve admin-verified Airtime rate configuration when supplier network names/codes sync.
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
    supplier_last_seen_at=now(),
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.sync_provider_service_option(text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_provider_service_option(text,text,text,text,text,text,jsonb) to service_role;
