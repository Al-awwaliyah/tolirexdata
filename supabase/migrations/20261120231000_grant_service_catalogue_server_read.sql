-- The server-rendered customer catalogue reads this safe projection using the service role.
grant select on public.public_service_catalog to service_role;
