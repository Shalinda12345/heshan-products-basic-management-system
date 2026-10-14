/**
 * run-migration.ts
 * Brings an existing database up to date with app/db/schema.ts. Safe to run more than once:
 *   - creates the `returns` table if it does not already exist
 *   - adds the `expenses.employee_name` column if it does not already exist
 *   - creates the `stock_movements` ledger and, the first time, records each product's
 *     current stock as an opening balance so the ledger starts from the real levels
 *
 * DATABASE_URL must point at the database to migrate. Run with:
 *   npx tsx --env-file=.env.local app/run-migration.ts
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { toIsoDate } from "./lib/dates";

async function migrate() {
    console.log("Running migration: creating `returns` table...");

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS \`returns\` (
            \`return_id\`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            \`return_type\`     VARCHAR(100) NOT NULL,
            \`product_name\`    VARCHAR(255) NOT NULL,
            \`quantity\`        DOUBLE(10,2) NOT NULL,
            \`per_unit_amount\` DOUBLE(10,2) NOT NULL,
            \`total\`           DOUBLE(10,2) NOT NULL,
            \`stock_id\`        INT DEFAULT NULL,
            \`sale_id\`         INT DEFAULT NULL,
            \`expense_item_id\` INT DEFAULT NULL,
            \`return_date\`     DATE NOT NULL,
            \`created_at\`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("`returns` table created (or already exists).");

    console.log("Running migration: adding `expenses.employee_name` column...");

    const [rows] = await db.execute(sql`
        SELECT COUNT(*) AS column_count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'employee_name'
    `);
    const [{ column_count }] = rows as unknown as { column_count: number }[];

    if (Number(column_count) === 0) {
        await db.execute(sql`
            ALTER TABLE \`expenses\` ADD COLUMN \`employee_name\` VARCHAR(255) NULL AFTER \`expense_name\`
        `);
        console.log("`expenses.employee_name` column added.");
    } else {
        console.log("`expenses.employee_name` column already exists.");
    }

    console.log("Running migration: creating `stock_movements` table...");

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS \`stock_movements\` (
            \`movement_id\`   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            \`product_id\`    INT NOT NULL,
            \`product_name\`  VARCHAR(255) NOT NULL,
            \`direction\`     VARCHAR(3) NOT NULL,
            \`movement_type\` VARCHAR(50) NOT NULL,
            \`quantity\`      DOUBLE(10,2) NOT NULL,
            \`balance_after\` DOUBLE(10,2) NOT NULL,
            \`reference\`     VARCHAR(100) DEFAULT NULL,
            \`note\`          VARCHAR(255) DEFAULT NULL,
            \`movement_date\` DATE NOT NULL,
            \`created_at\`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY \`stock_movements_product_idx\` (\`product_id\`),
            KEY \`stock_movements_date_idx\` (\`movement_date\`)
        )
    `);

    const [movementRows] = await db.execute(sql`SELECT COUNT(*) AS movement_count FROM \`stock_movements\``);
    const [{ movement_count }] = movementRows as unknown as { movement_count: number }[];

    if (Number(movement_count) === 0) {
        await db.execute(sql`
            INSERT INTO \`stock_movements\`
                (product_id, product_name, direction, movement_type, quantity, balance_after, reference, movement_date)
            SELECT s.product_id, p.product_name, 'IN', 'opening_balance', s.quantity, s.quantity, 'Opening balance', ${toIsoDate(new Date())}
            FROM \`stocks\` s
            JOIN \`products\` p ON p.product_id = s.product_id
            WHERE s.quantity > 0
        `);
        console.log("`stock_movements` table ready; opening balances recorded.");
    } else {
        console.log("`stock_movements` table already has entries.");
    }

    console.log("Migration complete.");
    process.exit(0);
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
