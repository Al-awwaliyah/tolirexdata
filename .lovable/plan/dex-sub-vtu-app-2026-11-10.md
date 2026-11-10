# DEX Sub VTU App

## Build
- Replace the template home page with a clean, mobile-first DEX Sub storefront: Nigerian network choices, sample prices, testimonials, and sign-in/sign-up entry points.
- Add Supabase authentication with name and phone profiles, a separate protected admin role, and account-aware navigation.
- Create secure Supabase tables and policies for profiles, wallets, plans, orders, funding requests, and wallet transactions. Seed the requested data plans and bootstrap admin access for the email the user supplied.
- Build the signed-in dashboard, data purchase, wallet funding, and admin screens. Enforce wallet debits and funding approvals on the server; keep VTU fulfillment simulated and card payment as a placeholder.
- Validate the main screens and security-sensitive flows, and add focused tests for concrete user requirements.

## Technical details
- Keep the existing TanStack Start and Supabase integration; add only the missing Supabase client dependency.
- Use authenticated server functions and narrowly scoped database functions for balance changes and funding review. Verify admin roles server-side before privileged reads or writes.
- A data order starts as pending and is marked successful after the requested three-second simulation; bank funding stays pending until admin review.
- No live VTU provider or Flutterwave charge is connected.