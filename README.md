# DEX Sub

DEX Sub is a Nigerian digital services and VTU application built with React, TypeScript, TanStack Start, Tailwind CSS, and Supabase. The project includes wallet, authentication, transaction, and service-provider integration code.

## Requirements

- Node.js 22 or later
- Bun (recommended; the repository includes `bun.lock`) or npm
- A configured Supabase project

## Environment variables

Copy `.env.example` to `.env` for local development and provide the required values through your local environment or deployment secret manager. Never commit real credentials.

Client/runtime Supabase configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Server-only configuration may also include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CLUBKONNECT_USER_ID`
- `CLUBKONNECT_API_KEY`
- `CLUBKONNECT_CALLBACK_URL`
- `FLUTTERWAVE_SECRET_KEY`
- `APP_URL`

## Development

```sh
bun install
bun run dev
```

## Validation

```sh
bun run lint
bun run test
bun run build
```

Use the equivalent `npm` commands if you manage dependencies with npm.
