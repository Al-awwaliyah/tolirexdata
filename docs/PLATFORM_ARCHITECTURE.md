# TolirexData platform architecture

## Product
Nigeria-first digital services platform for Personal customers, Agents/Resellers and Businesses. Developer/API accounts remain outside launch scope. Staff use a separate protected Admin Dashboard.

## System boundaries
- Frontend: TanStack Start + React. Browser code uses only Supabase publishable credentials.
- Server functions: authenticate and authorize each caller, validate inputs, rate-limit, call suppliers and invoke restricted database routines.
- Supabase: Auth, PostgreSQL, RLS, migrations, audited pricing and double-entry ledger.
- Wallet collection: Flutterwave permanent NGN virtual accounts after the required KYC verification and approval.
- Service fulfilment: Topupmate is the launch supplier, behind a provider adapter boundary for future suppliers and failover.
- Growth: referrals, coupons, promotions, cashback and loyalty with explicit budgets and idempotent settlement.
- Cards: Topupmate virtual USD cards with KYC-gated issuance and Admin-controlled fees, minimum funding and markups.

## Account models
Personal customers own their wallet, virtual account, purchases and support history. Agents require approval and receive controlled pricing/commission rules. Businesses require verification and owner/member roles, business pricing, limits and reporting. Staff roles are Super Admin, Operations, Finance, Customer Support, Marketing and Compliance.

## Financial and operational invariants
- The ledger is the accounting source of truth; wallets.balance remains a compatibility projection until full cutover.
- Journals must balance debit and credit totals.
- Public catalogue reads use restricted views; supplier costs, provider identifiers and private metadata are never exposed to browser clients.
- Browser redirects never settle payments. Verify Flutterwave webhook authenticity, transaction reference, amount and NGN currency before wallet credit.
- Incoming events, deposits, orders, refunds, coupon redemptions and rewards are idempotent.
- Supplier acceptance/queued is not fulfilment success. On timeout, query the original supplier reference; do not retry using a new reference.
- Verify cable SmartCards and electricity meters before wallet debit.
- PIN and gift-card codes are sensitive fulfilment data; never log them.
- Card creation, minimum funding and card top-up markups are database settings controlled by authorized Finance/Super Admins, not secrets. Supplier API credentials remain secrets.
- Coupon discounts must be covered by margin or a separately budgeted promotion pool.
- Referral rewards remain pending until a qualifying settled transaction and fraud checks pass.
- Never write wallet balances or ledger rows from browser code.

## Privacy and secrets
Do not retain raw BVN/NIN unless the verified provider flow requires it; minimize retention and access. Identity values are encrypted before storage. Never expose identity data, ePINs, gift-card codes, card credentials, provider credentials, webhook secrets or service-role keys in UI, logs or browser payloads. Keep .env out of Git; use Vercel server environment variables and Supabase Edge Function secrets.

## Supplier catalogue and pricing
All products, plans, denominations, billers, operators and supplier costs are synchronized from Topupmate. Newly discovered catalogue entries remain private and unpublished until reviewed by an authorized administrator. Personal, Agent and Business selling prices are set in Admin. Supplier sync never publishes products or invents prices. If Topupmate does not return a product family or price, that service remains unavailable rather than using a static fallback.

## Delivery sequence
1. Provision the replacement Supabase project, apply migrations in order, bootstrap the first Super Admin and verify RLS.
2. Complete Personal/Agent/Business onboarding, KYC and approved permanent virtual-account issuance.
3. Complete Flutterwave webhook verification and idempotent deposit settlement.
4. Sync Topupmate catalogue, publish supplier-derived options/products and configure account pricing.
5. Validate Airtime, Data, Cable TV, Electricity, Recharge PIN, Data PIN, Education PIN, Internet and Gift Card sandbox flows.
6. Validate Topupmate virtual-card issuance, funding, withdrawal, details, transaction history and lifecycle operations.
7. Complete referrals, coupons, cashback, loyalty, campaign management, reconciliation and operational testing before production enablement.
