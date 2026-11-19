# TolirexData platform architecture

## Product
Nigeria-first service platform for personal customers, agents/resellers and businesses. Developer/API accounts are excluded from launch. Platform staff use a separate protected administration system.

## System boundaries
- Frontend: TanStack Start + React. Browser code uses only Supabase publishable credentials.
- Server functions: authenticate and authorize each caller, validate input, rate-limit, call providers and invoke restricted database routines.
- Supabase: Auth, PostgreSQL, RLS and migrations. Service-role access is server-only.
- Wallet collection: Flutterwave permanent NGN virtual accounts, subject to merchant eligibility and current API requirements.
- Fulfilment: ClubKonnect/Nellobyte first, behind provider adapters for future suppliers and failover.
- Growth: referrals, coupons, cashback and loyalty, with explicit budgets and idempotent settlement.

## Account models
Personal customers own their wallet, virtual account, purchases and support history. Agents require approval and receive controlled pricing/commission plans. Businesses require verification and have owner/member roles, business pricing, limits and reporting. Staff roles are Super Admin, Operations, Finance, Customer Support, Marketing and Compliance.

## Financial and operational invariants
- The ledger is the accounting source of truth; wallets.balance is a compatibility projection until cutover.
- A deferred database constraint trigger rejects journals whose debit and credit totals do not balance.
- Public catalogue reads use a restricted view; supplier costs, provider identifiers and internal metadata are not exposed to browser clients.
- Browser redirects never settle payments. Verify Flutterwave webhook authenticity and transaction status, exact reference, amount and NGN currency.
- Incoming events, deposits, orders, refunds, coupon redemptions and rewards must be idempotent.
- Supplier acceptance/queued is not fulfilment success. On timeout, query the original RequestID; do not retry using a new ID.
- Verify cable smartcards and electricity meters before purchase.
- Coupon discounts must be covered by margin or a separately budgeted promotion pool.
- Referral rewards remain pending until a qualifying settled transaction and fraud checks pass.
- Never write wallet balances or ledger rows from browser code.

## Privacy and secrets
Do not retain raw BVN/NIN unless the verified provider flow requires it; minimize retention and access. Never expose identity data, ePINs, provider credentials, webhook secrets or service-role keys in UI, logs or browser payloads. Store masked sender account details where possible. Keep .env out of Git; use Vercel environment variables and Supabase secrets.

## Migration scope and launch gates
The foundation migration adds account models, KYC, staff permissions, ledger tables, virtual-account and deposit-event records, service catalogue and orders, referrals, coupons, loyalty, support, notifications, settings, feature flags and audit logs. It does not activate a supplier, create a live virtual account, settle a real deposit or invent service prices. Provider eligibility, secure webhook settlement, catalogue sync and tested purchase adapters are separate launch gates. Developer/API access remains disabled.

## Delivery sequence
1. Provision the replacement Supabase project, follow `docs/FRESH_SUPABASE_SETUP.md`, bootstrap the first administrator explicitly, then verify RLS and migration history.
2. Implement personal/agent/business onboarding and KYC.
3. Implement Flutterwave permanent virtual-account issuance and atomic verified deposit settlement.
4. Implement ClubKonnect catalogue sync and idempotent purchase/query/refund adapters.
5. Implement account pricing, referral qualification, coupon budgets, cashback and loyalty settlement.
6. Implement admin control centre, reconciliation, audit and reporting.
7. Run sandbox end-to-end, security and operational tests before production enablement.
