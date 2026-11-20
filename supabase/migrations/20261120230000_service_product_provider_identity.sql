-- Idempotent supplier product identity for catalogue synchronization.
-- Provider product codes are namespaced by network/operator by the importer.
create unique index if not exists service_products_provider_product_code_uidx
  on public.service_products(provider_id, provider_product_code)
  where provider_id is not null and provider_product_code is not null;

comment on index public.service_products_provider_product_code_uidx is
  'Prevents duplicate supplier products during repeat catalogue synchronization.';
