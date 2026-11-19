-- TolirexData platform foundation. Additive; preserves existing customer and wallet tables.
create extension if not exists pgcrypto;

alter table public.profiles
 add column if not exists account_type text not null default 'personal' check(account_type in ('personal','agent','business')),
 add column if not exists country_code char(2) not null default 'NG',
 add column if not exists kyc_level smallint not null default 0 check(kyc_level between 0 and 3),
 add column if not exists account_status text not null default 'active' check(account_status in ('active','restricted','suspended','closed'));
alter table public.wallets
 add column if not exists currency char(3) not null default 'NGN',
 add column if not exists wallet_status text not null default 'active' check(wallet_status in ('active','frozen','closed'));

create table if not exists public.platform_admin_memberships(
 user_id uuid primary key references auth.users(id) on delete restrict,
 admin_role text not null check(admin_role in ('super_admin','operations_admin','finance_admin','customer_support','marketing_admin','compliance_admin')),
 active boolean not null default true, granted_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.admin_permissions(
 permission_key text primary key, description text not null, created_at timestamptz not null default now()
);
create table if not exists public.admin_role_permissions(
 admin_role text not null, permission_key text not null references public.admin_permissions(permission_key) on delete cascade,
 primary key(admin_role,permission_key)
);
insert into public.admin_permissions values
 ('dashboard.read','View platform overview',now()),('customers.read','View customers',now()),
 ('customers.manage','Manage customer restrictions',now()),('kyc.review','Review KYC',now()),
 ('wallets.read','View wallets and ledger',now()),('wallets.adjust','Audited wallet adjustments',now()),
 ('finance.read','View financial reports',now()),('fundings.manage','Resolve funding exceptions',now()),
 ('services.manage','Manage services and catalogue',now()),('providers.manage','Manage provider routing',now()),
 ('orders.read','View service orders',now()),('orders.manage','Resolve service orders',now()),
 ('pricing.manage','Manage pricing',now()),('growth.manage','Manage referrals and promotions',now()),
 ('support.manage','Manage support and disputes',now()),('notifications.manage','Manage communications',now()),
 ('settings.manage','Manage platform settings',now()),('audit.read','Read audit logs',now()),
 ('staff.manage','Manage internal administrators',now())
on conflict do nothing;
insert into public.admin_role_permissions(admin_role,permission_key)
select 'super_admin',permission_key from public.admin_permissions on conflict do nothing;
insert into public.admin_role_permissions values
 ('operations_admin','dashboard.read'),('operations_admin','customers.read'),('operations_admin','customers.manage'),('operations_admin','orders.read'),('operations_admin','orders.manage'),('operations_admin','services.manage'),('operations_admin','providers.manage'),('operations_admin','support.manage'),
 ('finance_admin','dashboard.read'),('finance_admin','wallets.read'),('finance_admin','finance.read'),('finance_admin','fundings.manage'),('finance_admin','wallets.adjust'),('finance_admin','audit.read'),
 ('customer_support','dashboard.read'),('customer_support','customers.read'),('customer_support','orders.read'),('customer_support','support.manage'),
 ('marketing_admin','dashboard.read'),('marketing_admin','growth.manage'),('marketing_admin','notifications.manage'),
 ('compliance_admin','dashboard.read'),('compliance_admin','customers.read'),('compliance_admin','kyc.review'),('compliance_admin','audit.read')
on conflict do nothing;

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.platform_admin_memberships where user_id=p_user_id and active)
$$;
create or replace function public.has_admin_permission(p_permission text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.platform_admin_memberships m join public.admin_role_permissions rp on rp.admin_role=m.admin_role
 where m.user_id=p_user_id and m.active and rp.permission_key=p_permission)
$$;
revoke all on function public.is_platform_admin(uuid) from public,anon;
revoke all on function public.has_admin_permission(text,uuid) from public,anon;
grant execute on function public.is_platform_admin(uuid),public.has_admin_permission(text,uuid) to authenticated,service_role;

create table if not exists public.agent_accounts(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete restrict,
 business_name text, status text not null default 'pending' check(status in ('pending','active','rejected','suspended')),
 commission_plan text, approved_by uuid references auth.users(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.businesses(
 id uuid primary key default gen_random_uuid(), legal_name text not null, trading_name text,
 registration_number text, country_code char(2) not null default 'NG',
 status text not null default 'pending' check(status in ('pending','active','rejected','suspended')),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.business_members(
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete restrict,
 member_role text not null default 'owner' check(member_role in ('owner','admin','finance','operator','viewer')),
 status text not null default 'active' check(status in ('invited','active','suspended')),
 created_at timestamptz not null default now(), primary key(business_id,user_id)
);
create table if not exists public.kyc_records(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 level smallint not null check(level between 1 and 3),
 status text not null default 'pending' check(status in ('pending','approved','rejected','needs_information')),
 provider_reference text, document_storage_path text, reviewer_id uuid references auth.users(id),
 reviewed_at timestamptz, review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Double-entry journal; legacy wallets.balance remains a compatibility projection during migration.
create table if not exists public.ledger_accounts(
 id uuid primary key default gen_random_uuid(), account_code text not null unique, account_name text not null,
 account_type text not null check(account_type in ('asset','liability','equity','revenue','expense')),
 user_id uuid references auth.users(id) on delete restrict, currency char(3) not null default 'NGN',
 created_at timestamptz not null default now()
);
create table if not exists public.journal_transactions(
 id uuid primary key default gen_random_uuid(), reference_type text not null, reference_id uuid not null,
 idempotency_key text not null unique, description text not null,
 status text not null default 'posted' check(status in ('posted','reversed')),
 created_at timestamptz not null default now(), unique(reference_type,reference_id)
);
create table if not exists public.ledger_entries(
 id uuid primary key default gen_random_uuid(), journal_transaction_id uuid not null references public.journal_transactions(id) on delete restrict,
 ledger_account_id uuid not null references public.ledger_accounts(id) on delete restrict,
 direction text not null check(direction in ('debit','credit')), amount numeric(18,2) not null check(amount>0),
 currency char(3) not null default 'NGN', created_at timestamptz not null default now()
);
create index if not exists ledger_entries_account_idx on public.ledger_entries(ledger_account_id,created_at desc);
insert into public.ledger_accounts(account_code,account_name,account_type,user_id,currency)
select 'customer-wallet:'||user_id::text,'Customer wallet liability','liability',user_id,currency from public.wallets
on conflict do nothing;
insert into public.ledger_accounts(account_code,account_name,account_type) values
 ('platform:bank-clearing','Bank and payment clearing','asset'),
 ('platform:provider-payable','Service provider payable','liability'),
 ('platform:promotion-expense','Promotion and rewards expense','expense'),
 ('platform:operating-revenue','Platform operating revenue','revenue')
on conflict do nothing;
create or replace function public.ensure_customer_wallet_ledger_account()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.ledger_accounts(account_code,account_name,account_type,user_id,currency)
 values('customer-wallet:'||new.user_id::text,'Customer wallet liability','liability',new.user_id,new.currency)
 on conflict do nothing; return new;
end $$;
drop trigger if exists wallets_create_ledger_account on public.wallets;
create trigger wallets_create_ledger_account after insert on public.wallets
for each row execute function public.ensure_customer_wallet_ledger_account();

create table if not exists public.virtual_accounts(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 provider text not null default 'flutterwave', provider_reference text, account_number text not null,
 bank_name text not null, account_name text not null, currency char(3) not null default 'NGN',
 is_permanent boolean not null default true,
 status text not null default 'pending' check(status in ('pending','active','failed','disabled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider,provider_reference), unique(provider,account_number)
);
create unique index if not exists one_active_virtual_account_per_user
 on public.virtual_accounts(user_id,provider,currency) where status='active';
create table if not exists public.funding_events(
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete restrict,
 virtual_account_id uuid references public.virtual_accounts(id) on delete restrict,
 provider text not null, provider_event_id text not null, provider_transaction_id text,
 tx_reference text, amount numeric(18,2) not null check(amount>0), currency char(3) not null default 'NGN',
 sender_name text, sender_bank text, sender_account_last4 char(4),
 status text not null default 'received' check(status in ('received','verified','credited','rejected','reversed')),
 raw_payload jsonb not null default '{}'::jsonb, processed_at timestamptz,
 created_at timestamptz not null default now(), unique(provider,provider_event_id)
);
create unique index if not exists funding_provider_tx_unique on public.funding_events(provider,provider_transaction_id)
 where provider_transaction_id is not null;

create table if not exists public.service_categories(
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 description text, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.service_providers(
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 status text not null default 'disabled' check(status in ('active','degraded','disabled')),
 priority integer not null default 100, supports_airtime boolean not null default false,
 supports_data boolean not null default false, supports_cable boolean not null default false,
 supports_electricity boolean not null default false, supports_epin boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.service_products(
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.service_categories(id) on delete restrict,
 provider_id uuid references public.service_providers(id) on delete restrict, provider_product_code text,
 name text not null, network_or_operator text, description text, face_value numeric(18,2), cost_price numeric(18,2),
 selling_price numeric(18,2) not null check(selling_price>=0), currency char(3) not null default 'NGN',
 metadata jsonb not null default '{}'::jsonb, active boolean not null default false, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists service_products_catalog_idx on public.service_products(category_id,active,sort_order);
create table if not exists public.pricing_rules(
 id uuid primary key default gen_random_uuid(), category_id uuid references public.service_categories(id) on delete cascade,
 product_id uuid references public.service_products(id) on delete cascade,
 account_type text not null default 'personal' check(account_type in ('personal','agent','business')),
 markup_type text not null default 'fixed' check(markup_type in ('fixed','percentage')),
 markup_value numeric(18,4) not null default 0 check(markup_value>=0), fixed_selling_price numeric(18,2),
 active boolean not null default true, starts_at timestamptz, ends_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(category_id is not null or product_id is not null)
);
create table if not exists public.service_orders(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 category_id uuid not null references public.service_categories(id) on delete restrict,
 product_id uuid references public.service_products(id) on delete restrict,
 provider_id uuid references public.service_providers(id) on delete restrict,
 request_id text not null unique, provider_order_id text, recipient text not null,
 amount numeric(18,2) not null check(amount>0), currency char(3) not null default 'NGN',
 status text not null default 'pending' check(status in ('pending','processing','successful','failed','refunded','reversal_pending','unknown')),
 provider_status text, provider_message text, safe_provider_metadata jsonb not null default '{}'::jsonb,
 idempotency_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,idempotency_key)
);
create index if not exists service_orders_user_idx on public.service_orders(user_id,created_at desc);
create index if not exists service_orders_status_idx on public.service_orders(status,created_at);

create table if not exists public.referral_codes(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete restrict,
 code text not null unique, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.referrals(
 id uuid primary key default gen_random_uuid(), referrer_user_id uuid not null references auth.users(id) on delete restrict,
 referred_user_id uuid not null unique references auth.users(id) on delete restrict,
 referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','qualified','rewarded','rejected','reversed')),
 qualifying_order_id uuid references public.service_orders(id) on delete restrict, qualified_at timestamptz,
 created_at timestamptz not null default now(), check(referrer_user_id<>referred_user_id)
);
create table if not exists public.referral_rewards(
 id uuid primary key default gen_random_uuid(), referral_id uuid not null references public.referrals(id) on delete restrict,
 beneficiary_user_id uuid not null references auth.users(id) on delete restrict, amount numeric(18,2) not null check(amount>0),
 status text not null default 'pending' check(status in ('pending','settled','reversed')),
 journal_transaction_id uuid references public.journal_transactions(id) on delete restrict,
 created_at timestamptz not null default now(), unique(referral_id,beneficiary_user_id)
);
create table if not exists public.coupons(
 id uuid primary key default gen_random_uuid(), code text not null unique, description text,
 discount_type text not null check(discount_type in ('fixed','percentage')), discount_value numeric(18,4) not null check(discount_value>0),
 max_discount numeric(18,2), min_order_amount numeric(18,2) not null default 0,
 total_redemption_limit integer, per_user_limit integer not null default 1,
 starts_at timestamptz, ends_at timestamptz, budget_amount numeric(18,2),
 budget_spent numeric(18,2) not null default 0, active boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupon_redemptions(
 id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupons(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 service_order_id uuid references public.service_orders(id) on delete restrict,
 discount_amount numeric(18,2) not null check(discount_amount>0),
 status text not null default 'reserved' check(status in ('reserved','applied','released','reversed')),
 created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_usage_idx on public.coupon_redemptions(coupon_id,user_id);
create table if not exists public.loyalty_accounts(
 user_id uuid primary key references auth.users(id) on delete restrict,
 points_balance bigint not null default 0 check(points_balance>=0), updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_transactions(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 points bigint not null check(points<>0), reason text not null, reference_type text, reference_id uuid,
 idempotency_key text not null unique, created_at timestamptz not null default now()
);

create table if not exists public.support_tickets(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 subject text not null, category text not null default 'general',
 status text not null default 'open' check(status in ('open','in_progress','waiting_customer','resolved','closed')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 assigned_to uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.disputes(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 service_order_id uuid references public.service_orders(id) on delete restrict,
 funding_event_id uuid references public.funding_events(id) on delete restrict,
 reason text not null, status text not null default 'open' check(status in ('open','investigating','resolved','rejected')),
 resolution text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
 title text not null, body text not null,
 channel text not null default 'in_app' check(channel in ('in_app','email','sms','push','webhook')),
 status text not null default 'pending' check(status in ('pending','processing','delivered','failed','retrying')),
 metadata jsonb not null default '{}'::jsonb, delivered_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.platform_settings(
 setting_key text primary key, setting_value jsonb not null, is_public boolean not null default false,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table if not exists public.feature_flags(
 flag_key text primary key, enabled boolean not null default false, description text not null,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table if not exists public.audit_logs(
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users(id) on delete set null,
 action text not null, target_type text not null, target_id text, before_data jsonb, after_data jsonb,
 ip_hash text, created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- Keep the old activity table compatible with the new order and reward references.
alter table public.wallet_transactions drop constraint if exists wallet_transactions_reference_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_reference_type_check
 check(reference_type in ('data_order','funding','service_order','referral_reward','coupon','wallet_adjustment'));

-- Deny browser writes by default; explicitly grant customer-owned reads.
do $$
declare t text;
begin
 foreach t in array array['platform_admin_memberships','admin_permissions','admin_role_permissions','agent_accounts','businesses','business_members','kyc_records','ledger_accounts','journal_transactions','ledger_entries','virtual_accounts','funding_events','service_categories','service_providers','service_products','pricing_rules','service_orders','referral_codes','referrals','referral_rewards','coupons','coupon_redemptions','loyalty_accounts','loyalty_transactions','support_tickets','disputes','notifications','platform_settings','feature_flags','audit_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from anon,authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
grant select on public.virtual_accounts,public.service_orders,public.referral_codes,public.referrals,public.loyalty_accounts,public.loyalty_transactions,public.support_tickets,public.disputes,public.notifications to authenticated;
create policy "Owner reads virtual account" on public.virtual_accounts for select to authenticated using(user_id=auth.uid());
create policy "Owner reads service orders" on public.service_orders for select to authenticated using(user_id=auth.uid());
create policy "Owner reads referral code" on public.referral_codes for select to authenticated using(user_id=auth.uid());
create policy "Referral participants read" on public.referrals for select to authenticated using(referrer_user_id=auth.uid() or referred_user_id=auth.uid());
create policy "Owner reads loyalty account" on public.loyalty_accounts for select to authenticated using(user_id=auth.uid());
create policy "Owner reads loyalty activity" on public.loyalty_transactions for select to authenticated using(user_id=auth.uid());
create policy "Owner reads support tickets" on public.support_tickets for select to authenticated using(user_id=auth.uid());
create policy "Owner reads disputes" on public.disputes for select to authenticated using(user_id=auth.uid());
create policy "Owner reads notifications" on public.notifications for select to authenticated using(user_id=auth.uid());
grant select on public.service_categories,public.service_products to anon,authenticated;
create policy "Active categories are public" on public.service_categories for select to anon,authenticated using(active);
create policy "Active products are public" on public.service_products for select to anon,authenticated using(active);

-- The server creates a pending order and debits once before calling the supplier.
create or replace function public.create_service_order_and_debit_wallet(
 p_user_id uuid,p_category_id uuid,p_product_id uuid,p_provider_id uuid,
 p_request_id text,p_recipient text,p_amount numeric,p_idempotency_key text
) returns public.service_orders language plpgsql security definer set search_path=public as $$
declare v_order public.service_orders%rowtype; v_wallet public.wallets%rowtype;
 v_wallet_account uuid; v_provider_account uuid; v_journal uuid;
begin
 if p_user_id is null or p_amount is null or p_amount<=0 or nullif(trim(p_request_id),'') is null
   or nullif(trim(p_recipient),'') is null or nullif(trim(p_idempotency_key),'') is null then
  raise exception 'Invalid service order details';
 end if;
 select * into v_order from public.service_orders where user_id=p_user_id and idempotency_key=p_idempotency_key;
 if found then return v_order; end if;
 select * into v_wallet from public.wallets where user_id=p_user_id for update;
 if not found or v_wallet.wallet_status<>'active' then raise exception 'Wallet unavailable'; end if;
 if v_wallet.balance<p_amount then raise exception 'Insufficient wallet balance'; end if;
 if not exists(select 1 from public.service_products p join public.service_categories c on c.id=p.category_id
  where p.id=p_product_id and p.category_id=p_category_id and p.active and c.active) then
  raise exception 'Service product unavailable';
 end if;
 insert into public.service_orders(user_id,category_id,product_id,provider_id,request_id,recipient,amount,idempotency_key)
 values(p_user_id,p_category_id,p_product_id,p_provider_id,p_request_id,p_recipient,p_amount,p_idempotency_key)
 returning * into v_order;
 update public.wallets set balance=balance-p_amount where user_id=p_user_id;
 select id into v_wallet_account from public.ledger_accounts where account_code='customer-wallet:'||p_user_id::text;
 select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
 insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
 values('service_order',v_order.id,'service-order:'||v_order.id::text,'Service purchase reservation') returning id into v_journal;
 insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount)
 values(v_journal,v_wallet_account,'debit',p_amount),(v_journal,v_provider_account,'credit',p_amount);
 insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
 values(p_user_id,p_amount,'debit','service_order',v_order.id,'Service purchase');
 return v_order;
exception when unique_violation then
 select * into v_order from public.service_orders where user_id=p_user_id and idempotency_key=p_idempotency_key;
 if found then return v_order; end if; raise;
end $$;

create or replace function public.settle_service_order(p_order_id uuid,p_provider_order_id text,p_provider_status text,p_safe_metadata jsonb default '{}'::jsonb)
returns public.service_orders language plpgsql security definer set search_path=public as $$
declare v_order public.service_orders%rowtype;
begin
 update public.service_orders set status='successful',provider_order_id=coalesce(p_provider_order_id,provider_order_id),
 provider_status=p_provider_status,safe_provider_metadata=coalesce(p_safe_metadata,'{}'::jsonb),updated_at=now()
 where id=p_order_id and status in ('pending','processing','unknown') returning * into v_order;
 if not found then
  select * into v_order from public.service_orders where id=p_order_id;
  if found and v_order.status='successful' then return v_order; end if;
  raise exception 'Order cannot be settled from current state';
 end if;
 return v_order;
end $$;

create or replace function public.refund_service_order(p_order_id uuid,p_reason text)
returns public.service_orders language plpgsql security definer set search_path=public as $$
declare v_order public.service_orders%rowtype; v_wallet_account uuid; v_provider_account uuid; v_journal uuid;
begin
 select * into v_order from public.service_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.status='refunded' then return v_order; end if;
 if v_order.status not in ('failed','reversal_pending') then raise exception 'Order is not refundable'; end if;
 update public.wallets set balance=balance+v_order.amount where user_id=v_order.user_id;
 select id into v_wallet_account from public.ledger_accounts where account_code='customer-wallet:'||v_order.user_id::text;
 select id into v_provider_account from public.ledger_accounts where account_code='platform:provider-payable';
 insert into public.journal_transactions(reference_type,reference_id,idempotency_key,description)
 values('service_order_refund',v_order.id,'service-order-refund:'||v_order.id::text,coalesce(p_reason,'Service refund')) returning id into v_journal;
 insert into public.ledger_entries(journal_transaction_id,ledger_account_id,direction,amount)
 values(v_journal,v_wallet_account,'credit',v_order.amount),(v_journal,v_provider_account,'debit',v_order.amount);
 insert into public.wallet_transactions(user_id,amount,direction,reference_type,reference_id,description)
 values(v_order.user_id,v_order.amount,'credit','service_order',v_order.id,'Service order refund');
 update public.service_orders set status='refunded',updated_at=now() where id=p_order_id returning * into v_order;
 return v_order;
end $$;
revoke all on function public.create_service_order_and_debit_wallet(uuid,uuid,uuid,uuid,text,text,numeric,text) from public,anon,authenticated;
revoke all on function public.settle_service_order(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.refund_service_order(uuid,text) from public,anon,authenticated;
grant execute on function public.create_service_order_and_debit_wallet(uuid,uuid,uuid,uuid,text,text,numeric,text) to service_role;
grant execute on function public.settle_service_order(uuid,text,text,jsonb) to service_role;
grant execute on function public.refund_service_order(uuid,text) to service_role;

insert into public.service_categories(code,name,sort_order) values
 ('airtime','Airtime',10),('data','Mobile data',20),('cable_tv','Cable TV',30),
 ('electricity','Electricity',40),('recharge_pin','Recharge PINs',50),('education','Education PINs',60)
on conflict(code) do nothing;
insert into public.service_providers(code,name,status,supports_airtime,supports_data,supports_cable,supports_electricity,supports_epin)
values('clubkonnect','ClubKonnect / Nellobyte','disabled',true,true,true,true,true) on conflict(code) do nothing;
-- Provider activation, live catalogue import and payment settlement are intentionally separate steps.
