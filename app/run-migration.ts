/**
 * run-migration.ts
 * Brings the database in DATABASE_URL up to date with app/db/schema.ts (see app/db/migrations.ts for the steps).
 * Safe to run more than once. Run it against every database (local and production) before deploying new code:
 *   npm run db:migrate
 *
 * The first time, it also creates the administrator account "admin" and prints its temporary password
 * (or uses INITIAL_ADMIN_PASSWORD when that is set). The password must be changed at the first sign-in.
 */
import mysql from "mysql2/promise";
import { ensureAdminAccount, explainConnectionError, runMigrations } from "./db/migrations";

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Run with: npm run db:migrate");

    const conn = await mysql.createConnection({ uri: url });
    try {
        const { pathname, hostname } = new URL(url);
        console.log(`Migrating database "${pathname.slice(1)}" on ${hostname}...`);
        await runMigrations(conn, console.log);

        const admin = await ensureAdminAccount(conn, { password: process.env.INITIAL_ADMIN_PASSWORD });
        if (admin) {
            console.log("");
            console.log("  ┌──────────────────────────────────────────────────────────┐");
            console.log("  │  Administrator account ready                             │");
            console.log(`  │  Username: ${admin.username.padEnd(46)}│`);
            console.log(`  │  Password: ${admin.password.padEnd(46)}│`);
            console.log("  │  You will be asked to choose a new password at sign-in.  │");
            console.log("  └──────────────────────────────────────────────────────────┘");
            console.log("");
        }
        console.log("Migration complete.");
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    const explanation = explainConnectionError(err, process.env.DATABASE_URL ?? "");
    if (explanation) {
        console.error(`Migration not run: nothing was changed.\n${explanation}`);
    } else {
        console.error("Migration failed:", err);
    }
    process.exit(1);
});
