-- Provider availability is an explicit administrator-controlled platform setting.
create or replace function public.admin_set_service_provider_status(
  p_provider_id uuid,
  p_status text,
  p_priority integer default 100
) returns public.service_providers
language plpgsql security definer set search_path=public as $$
declare v_provider public.service_providers%rowtype; v_before jsonb; v_actor uuid:=auth.uid();
begin
  if v_actor is null or not public.has_admin_permission('providers.manage') then
    raise exception 'Provider management permission is required';
  end if;
  if p_status not in ('active','degraded','disabled') or p_priority<1 or p_priority>10000 then
    raise exception 'Invalid provider status or priority';
  end if;
  select * into v_provider from public.service_providers where id=p_provider_id for update;
  if not found then raise exception 'Provider not found'; end if;
  v_before:=jsonb_build_object('status',v_provider.status,'priority',v_provider.priority);
  update public.service_providers set status=p_status,priority=p_priority,updated_at=now()
  where id=p_provider_id returning * into v_provider;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,before_data,after_data)
  values(v_actor,'provider.status.updated','service_provider',p_provider_id::text,v_before,
    jsonb_build_object('status',v_provider.status,'priority',v_provider.priority));
  return v_provider;
end;
$$;
revoke all on function public.admin_set_service_provider_status(uuid,text,integer) from public,anon;
grant execute on function public.admin_set_service_provider_status(uuid,text,integer) to authenticated;
