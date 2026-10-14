/**
 * Database migrations: brings any database (empty, or created by an older version of the app) up to
 * app/db/schema.ts. Every step checks before it changes anything, so running them again is harmless.
 * Steps run in order and are never edited once released: later changes are new steps at the end.
 *
 * Used by app/run-migration.ts (npm run db:migrate) and by the test suites, which build their
 * database through these same steps.
 */
import type { Connection } from "mysql2/promise";
import { toIsoDate } from "../lib/dates";
import { generateTemporaryPassword, hashPassword } from "../lib/password";

export type RunSql = <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<T[]>;
type Log = (message: string) => void;

// A plain explanation of why a command-line script couldn't use the database in `url`, or null for other errors
export function explainConnectionError(error: unknown, url: string): string | null {
    const code = (error as { code?: unknown } | null)?.code;
    let where = "the database server";
    let database = "";
    try {
        const parsed = new URL(url);
        where = `${parsed.hostname}:${parsed.port || "3306"}`;
        database = parsed.pathname.slice(1);
    } catch {
        // keep the generic wording
    }
    switch (code) {
        case "ECONNREFUSED":
            return `Cannot connect to the database server at ${where}: nothing is listening there.\n`
                + "Start MySQL/MariaDB (for a local XAMPP database: click Start next to MySQL in the XAMPP Control Panel), then run this again.";
        case "ETIMEDOUT":
        case "ENOTFOUND":
        case "EAI_AGAIN":
        case "EHOSTUNREACH":
            return `Cannot reach the database server at ${where}. Check the host name in DATABASE_URL and the internet connection.`;
        case "ER_ACCESS_DENIED_ERROR":
            return `The database server at ${where} refused the username or password in DATABASE_URL.`;
        case "ER_BAD_DB_ERROR":
            return `The database "${database}" does not exist on ${where}. Create it first, or correct DATABASE_URL.`;
        default:
            return null;
    }
}

export function sqlRunner(conn: Connection): RunSql {
    return async <T>(sql: string, values?: unknown[]) => {
        const [rows] = await conn.query(sql, values);
        return rows as T[];
    };
}

// ─── Schema inspection ────────────────────────────────────────────────────────

async function columnInfo(sql: RunSql, table: string, column: string) {
    const [row] = await sql<{ IS_NULLABLE: string; COLUMN_DEFAULT: string | null }>(
        "SELECT IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        [table, column]
    );
    return row ?? null;
}

async function indexExists(sql: RunSql, table: string, index: string): Promise<boolean> {
    const rows = await sql(
        "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
        [table, index]
    );
    return rows.length > 0;
}

// Adds a column unless it is already there; true when it was added just now
async function addColumn(sql: RunSql, log: Log, table: string, column: string, definition: string): Promise<boolean> {
    if (await columnInfo(sql, table, column)) return false;
    await sql(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    log(`  added ${table}.${column}`);
    return true;
}

// Rows that existed before this column get NULL (their creation time is unknown); new rows get the time they are inserted
async function addCreatedAt(sql: RunSql, log: Log, table: string, column = "created_at") {
    await addColumn(sql, log, table, column, "TIMESTAMP NULL DEFAULT NULL");
    const info = await columnInfo(sql, table, column);
    if (info && info.COLUMN_DEFAULT === null) {
        await sql(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`);
    }
}

async function addIndex(sql: RunSql, log: Log, table: string, index: string, definition: string) {
    if (await indexExists(sql, table, index)) return;
    await sql(`ALTER TABLE \`${table}\` ADD ${definition}`);
    log(`  added index ${table}.${index}`);
}

// Columns for voidable documents (sales, expenses, returns)
async function addVoidColumns(sql: RunSql, log: Log, table: string) {
    await addColumn(sql, log, table, "status", "VARCHAR(10) NOT NULL DEFAULT 'posted'");
    await addColumn(sql, log, table, "void_reason", "VARCHAR(255) NULL DEFAULT NULL");
    await addColumn(sql, log, table, "voided_at", "TIMESTAMP NULL DEFAULT NULL");
    await addColumn(sql, log, table, "voided_by", "INT NULL DEFAULT NULL");
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS: { name: string; run: (sql: RunSql, log: Log) => Promise<void> }[] = [
    {
        // The tables of the original app, as they were first created
        name: "Base tables",
        run: async (sql) => {
            await sql(`CREATE TABLE IF NOT EXISTS users (
                id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS products (
                product_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                product_name VARCHAR(255) NOT NULL,
                description VARCHAR(255) NOT NULL
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS customers (
                customer_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS sales (
                sale_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                grand_total DOUBLE(10,2) NOT NULL,
                sale_date DATE NOT NULL
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS sale_items (
                sale_detail_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                sale_id INT NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                quantity DOUBLE(10,2) NOT NULL,
                selling_price DOUBLE(10,2) NOT NULL,
                total DOUBLE(10,2) NOT NULL
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS expenses_list (
                expense_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                expense_name VARCHAR(255) NOT NULL
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS expenses (
                expense_item_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                expense_name VARCHAR(255) NOT NULL,
                quantity DOUBLE(10,2),
                per_expense_amount DOUBLE(10,2) NOT NULL,
                total DOUBLE(10,2) NOT NULL,
                expense_date DATE NOT NULL
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS stocks (
                stock_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                product_id INT NOT NULL UNIQUE,
                quantity DOUBLE(10,2) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`);
            await sql(`CREATE TABLE IF NOT EXISTS employees (
                employee_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
                employee_name VARCHAR(255) NOT NULL,
                employee_address VARCHAR(255) NOT NULL,
                employee_contact_no VARCHAR(255) NOT NULL,
                maritial_status VARCHAR(255) NOT NULL
            )`);
        },
    },
    {
        name: "Returns",
        run: async (sql) => {
            await sql(`CREATE TABLE IF NOT EXISTS returns (
                return_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                return_type     VARCHAR(100) NOT NULL,
                product_name    VARCHAR(255) NOT NULL,
                quantity        DOUBLE(10,2) NOT NULL,
                per_unit_amount DOUBLE(10,2) NOT NULL,
                total           DOUBLE(10,2) NOT NULL,
                stock_id        INT DEFAULT NULL,
                sale_id         INT DEFAULT NULL,
                expense_item_id INT DEFAULT NULL,
                return_date     DATE NOT NULL,
                created_at      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            )`);
        },
    },
    {
        name: "Employee on salary expenses",
        run: async (sql, log) => {
            await addColumn(sql, log, "expenses", "employee_name", "VARCHAR(255) NULL AFTER expense_name");
        },
    },
    {
        // Stock ledger; the first time, each product's current stock is recorded as its opening balance
        name: "Stock ledger",
        run: async (sql, log) => {
            await sql(`CREATE TABLE IF NOT EXISTS stock_movements (
                movement_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                product_id    INT NOT NULL,
                product_name  VARCHAR(255) NOT NULL,
                direction     VARCHAR(3) NOT NULL,
                movement_type VARCHAR(50) NOT NULL,
                quantity      DOUBLE(10,2) NOT NULL,
                balance_after DOUBLE(10,2) NOT NULL,
                reference     VARCHAR(100) DEFAULT NULL,
                note          VARCHAR(255) DEFAULT NULL,
                movement_date DATE NOT NULL,
                created_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                KEY stock_movements_product_idx (product_id),
                KEY stock_movements_date_idx (movement_date)
            )`);
            const [{ movement_count }] = await sql<{ movement_count: number }>("SELECT COUNT(*) AS movement_count FROM stock_movements");
            if (Number(movement_count) === 0) {
                await sql(
                    `INSERT INTO stock_movements
                        (product_id, product_name, direction, movement_type, quantity, balance_after, reference, movement_date)
                     SELECT s.product_id, p.product_name, 'IN', 'opening_balance', s.quantity, s.quantity, 'Opening balance', ?
                     FROM stocks s JOIN products p ON p.product_id = s.product_id
                     WHERE s.quantity > 0`,
                    [toIsoDate(new Date())]
                );
                log("  recorded opening stock balances");
            }
        },
    },
    {
        name: "User accounts",
        run: async (sql, log) => {
            const addedUsername = await addColumn(sql, log, "users", "username", "VARCHAR(50) NULL AFTER id");
            await addColumn(sql, log, "users", "password_hash", "VARCHAR(255) NULL DEFAULT NULL");
            await addColumn(sql, log, "users", "role", "VARCHAR(20) NOT NULL DEFAULT 'staff'");
            await addColumn(sql, log, "users", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
            await addColumn(sql, log, "users", "must_change_password", "TINYINT(1) NOT NULL DEFAULT 0");
            await addColumn(sql, log, "users", "session_version", "INT NOT NULL DEFAULT 1");
            await addColumn(sql, log, "users", "failed_login_attempts", "INT NOT NULL DEFAULT 0");
            await addColumn(sql, log, "users", "locked_until", "TIMESTAMP NULL DEFAULT NULL");
            await addColumn(sql, log, "users", "last_login_at", "TIMESTAMP NULL DEFAULT NULL");
            await addColumn(sql, log, "users", "updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

            // Rows from before user accounts existed get a placeholder username and stay disabled (they have no password)
            const unnamed = await sql("SELECT id FROM users WHERE username IS NULL OR username = ''");
            if (unnamed.length > 0) {
                await sql("UPDATE users SET username = CONCAT('user', id), is_active = 0 WHERE username IS NULL OR username = ''");
                log(`  disabled ${unnamed.length} old user row(s) without a login`);
            }
            const username = await columnInfo(sql, "users", "username");
            if (addedUsername || username?.IS_NULLABLE === "YES") {
                await sql("ALTER TABLE users MODIFY COLUMN username VARCHAR(50) NOT NULL");
            }
            if ((await columnInfo(sql, "users", "email"))?.IS_NULLABLE === "NO") {
                await sql("ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL");
            }
            await addIndex(sql, log, "users", "users_username_unique", "UNIQUE KEY users_username_unique (username)");
        },
    },
    {
        name: "Product prices, costs and reorder levels",
        run: async (sql, log) => {
            await addColumn(sql, log, "products", "unit_price", "DOUBLE(10,2) NULL DEFAULT NULL");
            await addColumn(sql, log, "products", "unit_cost", "DOUBLE(10,2) NULL DEFAULT NULL");
            await addColumn(sql, log, "products", "reorder_level", "DOUBLE(10,2) NULL DEFAULT NULL");
            await addColumn(sql, log, "products", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
            await addCreatedAt(sql, log, "products");
        },
    },
    {
        name: "Customer details",
        run: async (sql, log) => {
            await addColumn(sql, log, "customers", "phone", "VARCHAR(50) NULL DEFAULT NULL");
            await addColumn(sql, log, "customers", "address", "VARCHAR(255) NULL DEFAULT NULL");
            await addColumn(sql, log, "customers", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
            await addCreatedAt(sql, log, "customers");
        },
    },
    {
        name: "Employee status",
        run: async (sql, log) => {
            await addColumn(sql, log, "employees", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
            await addCreatedAt(sql, log, "employees");
        },
    },
    {
        // The categories that used to be special-cased in the expense form get the matching kind
        name: "Expense category kinds",
        run: async (sql, log) => {
            const addedKind = await addColumn(sql, log, "expenses_list", "kind", "VARCHAR(20) NOT NULL DEFAULT 'standard'");
            await addColumn(sql, log, "expenses_list", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
            if (addedKind) {
                await sql("UPDATE expenses_list SET kind = 'quantity' WHERE expense_name IN ('Milk Packet(900ml)', 'Sugar', 'Watalappan Cup', 'Drink Cup')");
                await sql("UPDATE expenses_list SET kind = 'salary' WHERE expense_name IN ('Salary', 'Salary Advance', 'Salary Loan')");
                await sql("UPDATE expenses_list SET kind = 'return' WHERE expense_name = 'Return'");
                log("  set the kind of existing expense categories");
            }
        },
    },
    {
        name: "Invoice status, customer link and audit columns",
        run: async (sql, log) => {
            await addColumn(sql, log, "sales", "customer_id", "INT NULL DEFAULT NULL AFTER sale_id");
            await addVoidColumns(sql, log, "sales");
            await addColumn(sql, log, "sales", "created_by", "INT NULL DEFAULT NULL");
            await addCreatedAt(sql, log, "sales");
            await addIndex(sql, log, "sales", "sales_date_idx", "INDEX sales_date_idx (sale_date)");
            // Link invoices to their customer by name (the lowest id when a name appears twice)
            await sql(`UPDATE sales s
                JOIN (SELECT customer_name, MIN(customer_id) AS customer_id FROM customers GROUP BY customer_name) c
                  ON c.customer_name = s.customer_name
                SET s.customer_id = c.customer_id
                WHERE s.customer_id IS NULL`);

            await addColumn(sql, log, "sale_items", "product_id", "INT NULL DEFAULT NULL AFTER sale_id");
            await addIndex(sql, log, "sale_items", "sale_items_sale_idx", "INDEX sale_items_sale_idx (sale_id)");
            await sql(`UPDATE sale_items si
                JOIN (SELECT product_name, MIN(product_id) AS product_id FROM products GROUP BY product_name) p
                  ON p.product_name = si.product_name
                SET si.product_id = p.product_id
                WHERE si.product_id IS NULL`);
        },
    },
    {
        name: "Expense status and audit columns",
        run: async (sql, log) => {
            await addVoidColumns(sql, log, "expenses");
            await addColumn(sql, log, "expenses", "created_by", "INT NULL DEFAULT NULL");
            await addCreatedAt(sql, log, "expenses");
            await addIndex(sql, log, "expenses", "expenses_date_idx", "INDEX expenses_date_idx (expense_date)");
        },
    },
    {
        name: "Return status and stock movement authors",
        run: async (sql, log) => {
            await addVoidColumns(sql, log, "returns");
            await addColumn(sql, log, "returns", "created_by", "INT NULL DEFAULT NULL");
            await addColumn(sql, log, "stock_movements", "created_by", "INT NULL DEFAULT NULL");
        },
    },
    {
        name: "Activity log",
        run: async (sql) => {
            await sql(`CREATE TABLE IF NOT EXISTS activity_log (
                activity_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                user_id     INT NULL DEFAULT NULL,
                username    VARCHAR(50) NULL DEFAULT NULL,
                action      VARCHAR(50) NOT NULL,
                entity_type VARCHAR(30) NULL DEFAULT NULL,
                entity_id   VARCHAR(50) NULL DEFAULT NULL,
                summary     VARCHAR(500) NOT NULL,
                details     TEXT NULL,
                ip_address  VARCHAR(64) NULL DEFAULT NULL,
                user_agent  VARCHAR(255) NULL DEFAULT NULL,
                KEY activity_log_time_idx (occurred_at),
                KEY activity_log_user_idx (user_id),
                KEY activity_log_entity_idx (entity_type, entity_id)
            )`);
        },
    },
];

export async function runMigrations(conn: Connection, log: Log = () => undefined): Promise<void> {
    const sql = sqlRunner(conn);
    for (const step of STEPS) {
        log(`• ${step.name}`);
        await step.run(sql, log);
    }
}

// Creates the first administrator account when there is no active administrator who can sign in.
// Returns the credentials when an account was created or restored, so they can be shown once.
export async function ensureAdminAccount(
    conn: Connection,
    options: { username?: string; password?: string } = {}
): Promise<{ username: string; password: string } | null> {
    const sql = sqlRunner(conn);
    const admins = await sql("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 AND password_hash IS NOT NULL");
    if (admins.length > 0) return null;

    const username = (options.username ?? "admin").trim().toLowerCase();
    const password = options.password || generateTemporaryPassword(14);
    const passwordHash = await hashPassword(password);

    const [existing] = await sql<{ id: number }>("SELECT id FROM users WHERE username = ?", [username]);
    if (existing) {
        await sql(
            `UPDATE users SET role = 'admin', is_active = 1, password_hash = ?, must_change_password = 1,
                failed_login_attempts = 0, locked_until = NULL, session_version = session_version + 1
             WHERE id = ?`,
            [passwordHash, existing.id]
        );
    } else {
        await sql(
            "INSERT INTO users (username, name, role, password_hash, must_change_password) VALUES (?, 'Administrator', 'admin', ?, 1)",
            [username, passwordHash]
        );
    }
    return { username, password };
}
