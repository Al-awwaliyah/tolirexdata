-- Prevent duplicate Topupmate supplier submissions when a customer retries
-- while the first request is between reservation and provider submission.
create or replace function public.claim_topupmate_service_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
    from public.service_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Service order not found';
  end if;

  -- A supplier reference is submitted at most once. Processing/unknown orders
  -- must be reconciled against the same request_id, not submitted again.
  if v_status <> 'pending' then
    return false;
  end if;

  update public.service_orders
     set status = 'processing',
         provider_status = 'submission_started',
         provider_message = 'Submitting to Topupmate',
         updated_at = now()
   where id = p_order_id
     and status = 'pending';

  return found;
end;
$$;

revoke all on function public.claim_topupmate_service_order(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_topupmate_service_order(uuid)
  to service_role;

comment on function public.claim_topupmate_service_order(uuid) is
  'Atomically claims a reserved Topupmate order for its one permitted supplier submission; retries reconcile the existing reference.';
