-- Remove publication as a purchase eligibility gate.
-- The supplier's active catalogue state and provider status remain authoritative.
do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.reserve_topupmate_service_order(uuid,text,uuid,text,text,text,numeric,integer,text,jsonb)'::regprocedure
  );
  v_definition := regexp_replace(
    v_definition,
    'and active[[:space:]]+and publication_status[[:space:]]*=[[:space:]]*''published''',
    'and active',
    'g'
  );
  if v_definition like '%publication_status%published%' then
    raise exception 'Publication filter remains in reserve_topupmate_service_order; inspect function before applying';
  end if;
  execute v_definition;
end $$;
