# Heshan Products — Business Manager

Sales, expenses, stock and reports for Heshan Products, with user accounts, role-based permissions and an
activity log of everything done in the system. Built with Next.js 16 (App Router), Drizzle ORM and MySQL/MariaDB.

## What it does

| Area | What people do there |
| --- | --- |
| **Dashboard** | Revenue, expenses, profit and margin for a day/week/month/year, each compared with the same stretch of the period before; live stock alerts |
| **Sales** | Post invoices (stock is deducted automatically); the **Invoices** register lists every invoice with who posted it, and managers can **void** one (its items go back into stock) |
| **Expenses** | Record expenses by category (amounts, quantity × rate, or salary payments to an employee) and process returns; the **Expense register** lets managers correct or void entries, and **Returns** lets them reverse a return |
| **Stock** | Live levels, stock in/out with reasons, **stock counts** that set stock to what was physically counted, and a ledger of every movement with who made it |
| **Reports** | Profit & loss, product performance (with estimated margins), customer performance (new, lapsed, quiet customers), expense analysis and stock health (reorder alerts, days of cover, stock value) — every report compares with the previous period and exports to CSV |
| **Manage** | Products (prices, unit costs, reorder levels), customers, employees, expense categories, **user accounts**, and the **activity log** |

Nothing needs to be changed in the database by hand: every list and every correction has a screen.
Voided invoices, expenses and returns stay on file (marked void, with the reason) and are left out of every total.

## Roles

Every account has one role. The API checks the role on every request; menus only hide what a role can't use.

| | Administrator | Owner | Manager | Staff |
| --- | :---: | :---: | :---: | :---: |
| Record sales, expenses, stock in/out | ✓ | ✓ | ✓ | ✓ |
| See invoices and sales reports | ✓ | ✓ | ✓ | ✓ |
| Dashboard and financial reports | ✓ | ✓ | ✓ | |
| Void invoices, correct/void expenses, process/void returns, stock counts | ✓ | ✓ | ✓ | |
| Manage products, customers, employees, expense categories | ✓ | ✓ | ✓ | |
| See the activity log | ✓ | ✓ | | |
| Manage user accounts | ✓ | | | |

The full matrix is on **Manage → Users & Access**, and lives in code in `app/lib/permissions.ts`.

## Accounts and security

- Passwords are stored as salted scrypt hashes. New accounts and password resets get a temporary password that must be changed at the first sign-in.
- Five wrong passwords lock an account for 15 minutes.
- Sessions last an hour of inactivity. Disabling a user, changing their role or resetting their password signs them out everywhere within seconds.
- Every change, sign-in and failed sign-in is written to the activity log in the same database transaction as the change itself, so the log can't miss anything or record something that didn't happen. Owners and administrators can filter it and export it to CSV.

## Setting up

1. Install: `npm install`
2. Create `.env.local` (git-ignored):

   ```bash
   DATABASE_URL=mysql://user:password@host:3306/database
   # Signs login sessions. Use a long random value, e.g. from: openssl rand -base64 32
   # (without it, a key derived from DATABASE_URL is used)
   AUTH_SECRET=...
   ```

3. Create or upgrade the database, and create the first administrator:

   ```bash
   npm run db:migrate
   ```

   The first run prints the username (`admin`) and a temporary password. Sign in with them and choose your own
   password. Set `INITIAL_ADMIN_PASSWORD` before the first run to choose the temporary password yourself.

4. Run: `npm run dev` (development) or `npm run build && npm start` (production).

### Time zone

Reports group by business day, so the server must run in the business's time zone. Set `TZ=Asia/Colombo` in the
hosting environment (or start the server with it).

### Upgrading an existing database

`npm run db:migrate` is safe to run any number of times: each step checks before changing anything
(see `app/db/migrations.ts`). Run it against **every** database (local and production) **before** deploying
new code that uses the new schema. Existing data is kept: old invoices are linked to their customers and
products by name, the old special expense categories get their entry type, and the stock ledger starts from
the current stock levels. `drizzle-kit push` does not work against MariaDB; use the migration script.

### Locked out?

If no administrator can sign in, reset a password from a machine with access to the database:

```bash
npm run user:reset-password -- admin
```

It prints a new temporary password, re-enables and unlocks the account, and records the reset in the activity log.
Day to day, administrators reset passwords on **Manage → Users & Access**.

## Testing

The tests need their own MySQL/MariaDB database, because they **wipe and re-seed it** on every test. Point `TEST_DATABASE_URL` at it in `.env.test.local` (git-ignored). The database name must end in `_test`, otherwise the tests refuse to run. It is created automatically if the server user is allowed to create databases; the tests build it with the same migrations as production.

```bash
# .env.test.local
TEST_DATABASE_URL=mysql://root@localhost:3306/heshanproducts_basic_management_system_test
```

| Command | What it runs |
| --- | --- |
| `npm test` | Unit + API tests (Vitest) |
| `npm run test:unit` | Unit tests only (no database needed): sessions, passwords, permissions, route protection, helpers |
| `npm run test:api` | One file per feature in `tests/api/`, calling the route handlers directly as each role, with the clock frozen on 2026-10-13. Includes an upgrade of a database from the previous version (`migration.test.ts`) and a permission check of every route for every role (`access.test.ts`) |
| `npm run test:e2e` | Browser tests (Playwright) in `tests/e2e/`. Builds the app, serves it on port 3210 against the test database and drives the installed Microsoft Edge |

Seeded test accounts (`admin`, `owner`, `manager`, `staff`, and the disabled `former`) all use the password in
`TEST_PASSWORD` (`tests/helpers/test-db.ts`). Failed browser tests leave screenshots and traces in `test-results/`;
`npx playwright show-report` opens the HTML report.

## Project layout

| Path | Contents |
| --- | --- |
| `app/api/` | Route handlers; each starts with `authorize(request, permission)` |
| `app/services/` | Business logic (sales, returns, expenses, stock ledger, users, reports), each change logged in its transaction |
| `app/lib/` | Shared code: permissions, sessions, passwords, formatting, periods; files without server imports are used by pages too |
| `app/db/` | Drizzle schema and the migrations |
| `app/admin/`, `app/reports/`, `app/pages/` | Management screens, reports, and the day-to-day sales/expense/stock screens |
| `proxy.ts` | Signs out expired sessions, enforces password changes, blocks cross-site API writes, keeps roles out of pages they can't use |
