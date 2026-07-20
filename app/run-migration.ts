/**
 * run-migration.ts
 * Creates the `returns` table in MySQL if it does not already exist.
 * Run with: npx ts-node --project tsconfig.json app/run-migration.ts
 *  OR:       npx tsx app/run-migration.ts
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

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

    console.log("`returns` table created (or already exists). Migration complete.");
    process.exit(0);
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
