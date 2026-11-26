-- Airtime starts at face value, matching IyanjuPay. Admin can add an
-- account-specific fixed fee or percentage markup from Pricing & Fees.
insert into public.pricing_rules(
  category_id,product_id,account_type,markup_type,markup_value,
  fixed_selling_price,active
)
select c.id,null,a.account_type,'fixed',0,null,true
from public.service_categories c
cross join (values('personal'),('agent'),('business')) as a(account_type)
where c.code='airtime'
on conflict(category_id,account_type) where product_id is null do nothing;
