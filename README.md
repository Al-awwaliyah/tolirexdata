# ToliRex Data

Build me a modern Nigerian VTU web app called ToliRex Data - like Zoedata but simpler and clean.

FEATURES:

1. Landing Page: Hero section "Buy Cheap Data, Airtime, DSTV, Electricity in Seconds", with MTN, Airtel, Glo, 9mobile logos, live prices, testimonials, and Login / Sign Up buttons. Colors: green and white, clean like Opay.

2. Auth: User can Sign Up with name, email, phone, password. Login / Logout. Use Supabase Auth.

3. User Dashboard:

- Show Wallet Balance in big card

- Buttons: Fund Wallet, Buy Data, Buy Airtime, Pay Electricity, TV Subscription

- Recent Transactions table

4. Buy Data Page:

- Select Network: MTN, Airtel, Glo, 9mobile

- Select Plan: Show list like 1GB - 30 days - ₦320, 2GB - 30 days - ₦640, 5GB - 30 days - ₦1,550, 10GB - 30 days - ₦3,050

- Input phone number

- Button: Buy Now. Deduct from wallet balance. Show success message.

- For now, do NOT connect real VTU API. Save order as "Pending" in database and simulate success after 3 seconds. I will connect real API later.

5. Fund Wallet Page:

- Show 2 options:

Option A: Transfer to bank account - Show account number 9051234567, Bank: Opay, Name: IyanjuPay - with Copy button and "I Have Sent It" button

Option B: Pay with Card - Use Flutterwave Payment Link placeholder button

- When user clicks "I Have Sent It", save as Pending Funding for admin to confirm.

6. Admin Dashboard:

- Admin can see all users, all orders, all pending fundings

- Admin can Approve / Reject funding and it updates user wallet balance automatically

- Admin can add / edit data plans and prices

7. Design: Mobile-first, fast, clean, Nigerian style. Use Naira ₦ symbol everywhere. No dollar.

TECH: Use React, Tailwind, Supabase for database and auth.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dff32801-d499-4138-8f33-6ead36e345a9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
