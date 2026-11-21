-- Provision Personal, Agent and Business workspace records from signup metadata.
-- KYC remains a separate verified workflow; account type never grants approval.
create or replace function public.handle_new_tolirexdata_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_type text;
  v_business_name text;
  v_business_id uuid;
begin
  v_type := case when new.raw_user_meta_data->>'account_type' in ('personal','agent','business')
    then new.raw_user_meta_data->>'account_type' else 'personal' end;
  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_legal_name'),'');
  insert into public.profiles(id,email,full_name,phone,account_type,business_legal_name)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'phone',''),v_type,v_business_name)
  on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,
    phone=excluded.phone,account_type=excluded.account_type,business_legal_name=excluded.business_legal_name;
  insert into public.wallets(user_id) values(new.id) on conflict(user_id) do nothing;
  insert into public.user_roles(user_id,role) values(new.id,'user') on conflict do nothing;
  if v_type='agent' then
    insert into public.agent_accounts(user_id,business_name,status)
    values(new.id,nullif(trim(new.raw_user_meta_data->>'agent_business_name'),''),'pending')
    on conflict(user_id) do nothing;
  elsif v_type='business' then
    if v_business_name is null or length(v_business_name)<2 then
      raise exception 'Registered business name is required for a business account';
    end if;
    insert into public.businesses(legal_name,country_code,status,created_by)
    values(v_business_name,'NG','pending',new.id)
    returning id into v_business_id;
    insert into public.business_members(business_id,user_id,member_role,status)
    values(v_business_id,new.id,'owner','active')
    on conflict(business_id,user_id) do nothing;
  end if;
  return new;
end $$;
