This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

The tests need their own MySQL/MariaDB database, because they **wipe and re-seed it** on every test. Point `TEST_DATABASE_URL` at it in `.env.test.local` (git-ignored). The database name must end in `_test`, otherwise the tests refuse to run. It is created automatically if the server user is allowed to create databases.

```bash
# .env.test.local
TEST_DATABASE_URL=mysql://root@localhost:3306/heshanproducts_basic_management_system_test
```

| Command | What it runs |
| --- | --- |
| `npm test` | Unit + API tests (Vitest), about 25 s |
| `npm run test:unit` | Unit tests only (no database needed): session tokens, route protection, helpers |
| `npm run test:api` | One file per feature in `tests/api/`, calling the route handlers directly with the clock frozen on 2026-10-13 |
| `npm run test:e2e` | Browser tests (Playwright) in `tests/e2e/`, one file per feature. Builds the app, serves it on port 3210 against the test database and drives the installed Microsoft Edge |

Failed browser tests leave screenshots and traces in `test-results/`; `npx playwright show-report` opens the HTML report.

## Database changes

Schema changes are applied with `npx tsx --env-file=.env.local app/run-migration.ts` (safe to run more than once). Run it against every database (local and production) **before** deploying code that uses the new schema. `drizzle-kit push` does not work against MariaDB.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
