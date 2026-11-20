-- Remove the starter category labels from the prototype seed.
-- Catalogue categories will be created from verified ClubKonnect catalogue data
-- during normalization; no supplier plans, denominations or products are seeded.
delete from public.service_categories c
where c.code in ('airtime','data','cable_tv','electricity','recharge_pin','education')
  and not exists (select 1 from public.service_products p where p.category_id=c.id);
