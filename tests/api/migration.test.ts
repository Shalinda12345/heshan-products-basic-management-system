// Upgrading a database created by the previous version of the app, as `npm run db:migrate` does on the
// real databases. Runs in its own database (…_migration_test) so the shared test data is untouched.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Connection } from "mysql2/promise";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "@/app/db/schema";
import { ensureAdminAccount, runMigrations } from "@/app/db/migrations";
import { verifyPassword } from "@/app/lib/password";
import { connectTestDb, ensureTestDatabase, testDatabaseUrl } from "../helpers/test-db";

// The schema and data of a database from before user accounts, the stock ledger and returns existed
const LEGACY = `
CREATE TABLE users (id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE products (product_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, product_name VARCHAR(255) NOT NULL, description VARCHAR(255) NOT NULL);
CREATE TABLE customers (customer_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, customer_name VARCHAR(255) NOT NULL);
CREATE TABLE sales (sale_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, customer_name VARCHAR(255) NOT NULL, grand_total DOUBLE(10,2) NOT NULL, sale_date DATE NOT NULL);
CREATE TABLE sale_items (sale_detail_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, sale_id INT NOT NULL, product_name VARCHAR(255) NOT NULL, quantity DOUBLE(10,2) NOT NULL, selling_price DOUBLE(10,2) NOT NULL, total DOUBLE(10,2) NOT NULL);
CREATE TABLE expenses_list (expense_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, expense_name VARCHAR(255) NOT NULL);
CREATE TABLE expenses (expense_item_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, expense_name VARCHAR(255) NOT NULL, quantity DOUBLE(10,2), per_expense_amount DOUBLE(10,2) NOT NULL, total DOUBLE(10,2) NOT NULL, expense_date DATE NOT NULL);
CREATE TABLE stocks (stock_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, product_id INT NOT NULL UNIQUE, quantity DOUBLE(10,2) NOT NULL DEFAULT 0, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE employees (employee_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY, employee_name VARCHAR(255) NOT NULL, employee_address VARCHAR(255) NOT NULL, employee_contact_no VARCHAR(255) NOT NULL, maritial_status VARCHAR(255) NOT NULL);
INSERT INTO users (name, email) VALUES ('Old Row', 'old@example.com');
INSERT INTO products (product_name, description) VALUES ('Watalappan', ''), ('Yogurt', '');
INSERT INTO customers (customer_name) VALUES ('Kamal Stores'), ('Kamal Stores'), ('Nimal Bakery');
INSERT INTO sales (customer_name, grand_total, sale_date) VALUES ('kamal stores', 300, '2026-01-05'), ('Gone Customer', 80, '2026-01-06');
INSERT INTO sale_items (sale_id, product_name, quantity, selling_price, total) VALUES (1, 'Watalappan', 2, 150, 300), (2, 'Discontinued', 1, 80, 80);
INSERT INTO expenses_list (expense_name) VALUES ('Sugar'), ('Salary'), ('Return'), ('Electricity');
INSERT INTO expenses (expense_name, quantity, per_expense_amount, total, expense_date) VALUES ('Sugar', 2, 250, 500, '2026-01-05');
INSERT INTO stocks (product_id, quantity) VALUES (1, 10), (2, 0);
`;

let conn: Connection;
const rows = async <T = Record<string, unknown>>(sql: string) => (await conn.query(sql))[0] as T[];

beforeAll(async () => {
    const url = new URL(testDatabaseUrl());
    url.pathname = url.pathname.replace(/_test$/, "_migration_test");
    await ensureTestDatabase(url.toString());
    conn = await connectTestDb(url.toString());
    const [tables] = await conn.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()");
    for (const { t } of tables as { t: string }[]) await conn.query(`DROP TABLE \`${t}\``);
    await conn.query(LEGACY);
});

afterAll(async () => {
    await conn?.end();
});

describe("upgrading an existing database", () => {
    let admin: { username: string; password: string } | null = null;

    beforeAll(async () => {
        await runMigrations(conn);
        admin = await ensureAdminAccount(conn);
    });

    it("ends with exactly the schema the app expects", async () => {
        for (const table of Object.values(schema) as MySqlTable[]) {
            const config = getTableConfig(table);
            const columns = await rows<{ Field: string; Null: string }>(`SHOW COLUMNS FROM \`${config.name}\``);
            expect(columns.map((c) => [c.Field, c.Null === "NO"]).sort(), config.name)
                .toEqual(config.columns.map((c) => [c.name, c.notNull]).sort());
        }
    });

    it("creates the administrator account, with a password to change at first sign-in", async () => {
        expect(admin?.username).toBe("admin");
        const [row] = await rows<{ role: string; is_active: number; must_change_password: number; password_hash: string }>(
            "SELECT role, is_active, must_change_password, password_hash FROM users WHERE username = 'admin'"
        );
        expect(row).toMatchObject({ role: "admin", is_active: 1, must_change_password: 1 });
        expect(await verifyPassword(admin!.password, row.password_hash)).toBe(true);
    });

    it("keeps old user rows but disables them (they have no password)", async () => {
        expect(await rows("SELECT id, username, email, is_active FROM users WHERE id = 1")).toEqual([
            { id: 1, username: "user1", email: "old@example.com", is_active: 0 },
        ]);
    });

    it("links old invoices to customers and products by name", async () => {
        expect(await rows("SELECT sale_id, customer_id, status FROM sales ORDER BY sale_id")).toEqual([
            { sale_id: 1, customer_id: 1, status: "posted" },
            { sale_id: 2, customer_id: null, status: "posted" },
        ]);
        expect(await rows("SELECT product_name, product_id FROM sale_items ORDER BY sale_detail_id")).toEqual([
            { product_name: "Watalappan", product_id: 1 },
            { product_name: "Discontinued", product_id: null },
        ]);
    });

    it("leaves the unknown creation time of old rows empty", async () => {
        expect(await rows("SELECT created_at, created_by FROM sales WHERE sale_id = 1")).toEqual([{ created_at: null, created_by: null }]);
    });

    it("gives the old special expense categories their kind", async () => {
        expect(await rows("SELECT expense_name, kind, is_active FROM expenses_list ORDER BY expense_id")).toEqual([
            { expense_name: "Sugar", kind: "quantity", is_active: 1 },
            { expense_name: "Salary", kind: "salary", is_active: 1 },
            { expense_name: "Return", kind: "return", is_active: 1 },
            { expense_name: "Electricity", kind: "standard", is_active: 1 },
        ]);
    });

    it("starts the stock ledger from the current stock levels", async () => {
        expect(await rows("SELECT product_id, movement_type, quantity, balance_after FROM stock_movements")).toEqual([
            { product_id: 1, movement_type: "opening_balance", quantity: 10, balance_after: 10 },
        ]);
    });

    it("records when each row added after the upgrade was created", async () => {
        await conn.query("INSERT INTO sales (customer_name, grand_total, sale_date) VALUES ('Nimal Bakery', 10, '2026-10-14')");
        await conn.query("INSERT INTO expenses (expense_name, per_expense_amount, total, expense_date) VALUES ('Sugar', 1, 1, '2026-10-14')");
        await conn.query("INSERT INTO products (product_name, description) VALUES ('Jelly', '')");
        await conn.query("INSERT INTO customers (customer_name) VALUES ('Hill Cafe')");
        await conn.query("INSERT INTO employees (employee_name, employee_address, employee_contact_no, maritial_status) VALUES ('Kasun', '', '', '')");
        expect(await rows(`SELECT
            (SELECT created_at FROM sales ORDER BY sale_id DESC LIMIT 1) IS NOT NULL AS sales,
            (SELECT created_at FROM expenses ORDER BY expense_item_id DESC LIMIT 1) IS NOT NULL AS expenses,
            (SELECT created_at FROM products ORDER BY product_id DESC LIMIT 1) IS NOT NULL AS products,
            (SELECT created_at FROM customers ORDER BY customer_id DESC LIMIT 1) IS NOT NULL AS customers,
            (SELECT created_at FROM employees ORDER BY employee_id DESC LIMIT 1) IS NOT NULL AS employees`))
            .toEqual([{ sales: 1, expenses: 1, products: 1, customers: 1, employees: 1 }]);
    });

    it("repairs creation-time columns left without a default by an earlier version of this migration", async () => {
        for (const table of ["sales", "expenses", "products", "customers", "employees"]) {
            await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN created_at TIMESTAMP NULL DEFAULT NULL`);
        }
        await runMigrations(conn);
        const defaults = await rows<{ TABLE_NAME: string; COLUMN_DEFAULT: string | null }>(
            "SELECT TABLE_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'created_at' AND TABLE_NAME IN ('sales','expenses','products','customers','employees')"
        );
        expect(defaults).toHaveLength(5);
        for (const { TABLE_NAME, COLUMN_DEFAULT } of defaults) expect(COLUMN_DEFAULT, TABLE_NAME).toMatch(/current_timestamp/i);
    });

    it("can run again without changing anything", async () => {
        await conn.query("UPDATE expenses_list SET kind = 'standard' WHERE expense_name = 'Sugar'");
        const before = await rows("SELECT * FROM stock_movements");
        await runMigrations(conn);
        expect(await ensureAdminAccount(conn)).toBeNull();
        expect(await rows("SELECT * FROM stock_movements")).toEqual(before);
        expect((await rows<{ kind: string }>("SELECT kind FROM expenses_list WHERE expense_name = 'Sugar'"))[0].kind).toBe("standard");
        expect((await rows<{ n: number }>("SELECT COUNT(*) AS n FROM users"))[0].n).toBe(2);
    });

    it("restores an administrator who can sign in when none is left", async () => {
        await conn.query("UPDATE users SET is_active = 0 WHERE username = 'admin'");
        const restored = await ensureAdminAccount(conn, { password: "Chosen-pass1" });
        expect(restored).toEqual({ username: "admin", password: "Chosen-pass1" });
        const [row] = await rows<{ is_active: number; password_hash: string }>("SELECT is_active, password_hash FROM users WHERE username = 'admin'");
        expect(row.is_active).toBe(1);
        expect(await verifyPassword("Chosen-pass1", row.password_hash)).toBe(true);
    });
});
