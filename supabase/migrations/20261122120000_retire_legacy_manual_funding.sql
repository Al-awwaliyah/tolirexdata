-- Retire legacy admin-approved wallet funding RPCs.
-- Keep historical fundings rows for audit/history, but all new wallet deposits
-- must originate from verified Flutterwave virtual-account events.
drop function if exists public.create_funding_request(numeric,text);
drop function if exists public.create_funding_request(uuid,numeric,text);
drop function if exists public.review_funding(uuid,text);
drop function if exists public.review_funding(uuid,uuid,text);
