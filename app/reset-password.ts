/**
 * reset-password.ts — emergency access recovery, for when no administrator can sign in.
 * Gives the user a new temporary password (to be changed at the next sign-in), unlocks the account,
 * re-enables it and signs it out everywhere. The reset is recorded in the activity log.
 *
 *   npm run user:reset-password -- <username>
 *
 * Day to day, administrators reset passwords on the Users page instead.
 */
import mysql from "mysql2/promise";
import { explainConnectionError } from "./db/migrations";
import { generateTemporaryPassword, hashPassword } from "./lib/password";

async function main() {
    const username = (process.argv[2] ?? "").trim().toLowerCase();
    if (!username) throw new Error("Usage: npm run user:reset-password -- <username>");

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");

    const conn = await mysql.createConnection({ uri: url });
    try {
        const [rows] = await conn.query("SELECT id, name FROM users WHERE username = ?", [username]);
        const [user] = rows as { id: number; name: string }[];
        if (!user) throw new Error(`There is no user named "${username}".`);

        const password = generateTemporaryPassword(14);
        await conn.query(
            `UPDATE users SET password_hash = ?, must_change_password = 1, is_active = 1, failed_login_attempts = 0,
                locked_until = NULL, session_version = session_version + 1
             WHERE id = ?`,
            [await hashPassword(password), user.id]
        );
        await conn.query(
            `INSERT INTO activity_log (occurred_at, user_id, username, action, entity_type, entity_id, summary)
             VALUES (CURRENT_TIMESTAMP, NULL, 'system', 'user.password_reset', 'user', ?, ?)`,
            [String(user.id), `Reset the password of "${username}" (${user.name}) from the command line`]
        );

        console.log(`New temporary password for "${username}": ${password}`);
        console.log("It must be changed at the next sign-in.");
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error(explainConnectionError(err, process.env.DATABASE_URL ?? "") ?? (err instanceof Error ? err.message : err));
    process.exit(1);
});
