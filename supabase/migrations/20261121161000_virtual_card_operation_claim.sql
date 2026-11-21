create or replace function public.claim_virtual_card_operation(p_operation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
 update public.virtual_card_operations set status='processing',updated_at=now()
 where id=p_operation_id and status='pending';
 get diagnostics v_count=row_count;
 return v_count=1;
end;
$$;
revoke all on function public.claim_virtual_card_operation(uuid) from public,anon,authenticated;
grant execute on function public.claim_virtual_card_operation(uuid) to service_role;
