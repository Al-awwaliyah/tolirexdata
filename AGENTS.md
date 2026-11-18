# Project development notes

- Keep wallet and admin mutations in authenticated TanStack server functions.
- Verify the caller's role before loading or using the Supabase service-role client.
- Never expose service-role credentials or provider secrets to browser code.
- Preserve existing authentication, wallet records, transaction history, and admin permissions when changing the app.
- Keep the public storefront and session-aware customer/admin views on the public `/` entry screen unless a route migration is explicitly requested.
- Make database schema changes deliberately: inspect the live schema, preserve existing data and policies, and test migrations and security policies before deployment.
