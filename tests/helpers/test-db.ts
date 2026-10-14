// Test database helpers shared by the Vitest API tests and the Playwright E2E tests.
// Tests wipe and re-seed the database, so they only ever run against TEST_DATABASE_URL,
// and only when that database's name ends in "_test".
import { config as loadEnv } from "dotenv";
import mysql from "mysql2/promise";

loadEnv({ path: ".env.test.local", quiet: true });

export function testDatabaseUrl(): string {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
        throw new Error(
            "TEST_DATABASE_URL is not set. Add it to .env.test.local, e.g. " +
            "TEST_DATABASE_URL=mysql://root@localhost:3306/heshanproducts_basic_management_system_test"
        );
    }
    const name = new URL(url).pathname.slice(1);
    if (!name.endsWith("_test")) {
        throw new Error(`Refusing to run tests against database "${name}": the name must end with "_test" because tests wipe it.`);
    }
    return url;
}

export async function connectTestDb() {
    return mysql.createConnection({ uri: testDatabaseUrl(), dateStrings: true, multipleStatements: true });
}

// MariaDB/MySQL DDL mirroring app/db/schema.ts (tests/api/schema.test.ts fails if they drift apart)
const SCHEMA = `
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE products (
    product_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL
);
CREATE TABLE customers (
    customer_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL
);
CREATE TABLE sales (
    sale_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    grand_total DOUBLE(10,2) NOT NULL,
    sale_date DATE NOT NULL
);
CREATE TABLE sale_items (
    sale_detail_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    sale_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity DOUBLE(10,2) NOT NULL,
    selling_price DOUBLE(10,2) NOT NULL,
    total DOUBLE(10,2) NOT NULL
);
CREATE TABLE expenses_list (
    expense_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    expense_name VARCHAR(255) NOT NULL
);
CREATE TABLE expenses (
    expense_item_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    expense_name VARCHAR(255) NOT NULL,
    employee_name VARCHAR(255) NULL,
    quantity DOUBLE(10,2),
    per_expense_amount DOUBLE(10,2) NOT NULL,
    total DOUBLE(10,2) NOT NULL,
    expense_date DATE NOT NULL
);
CREATE TABLE stocks (
    stock_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    product_id INT NOT NULL UNIQUE,
    quantity DOUBLE(10,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE employees (
    employee_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    employee_name VARCHAR(255) NOT NULL,
    employee_address VARCHAR(255) NOT NULL,
    employee_contact_no VARCHAR(255) NOT NULL,
    maritial_status VARCHAR(255) NOT NULL
);
CREATE TABLE returns (
    return_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    return_type VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity DOUBLE(10,2) NOT NULL,
    per_unit_amount DOUBLE(10,2) NOT NULL,
    total DOUBLE(10,2) NOT NULL,
    stock_id INT,
    sale_id INT,
    expense_item_id INT,
    return_date DATE NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE stock_movements (
    movement_id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    product_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    direction VARCHAR(3) NOT NULL,
    movement_type VARCHAR(50) NOT NULL,
    quantity DOUBLE(10,2) NOT NULL,
    balance_after DOUBLE(10,2) NOT NULL,
    reference VARCHAR(100),
    note VARCHAR(255),
    movement_date DATE NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    KEY stock_movements_product_idx (product_id),
    KEY stock_movements_date_idx (movement_date)
);`;

export const TABLES = ["users", "products", "customers", "sales", "sale_items", "expenses_list", "expenses", "stocks", "employees", "returns", "stock_movements"];

// Creates the test database (if needed) and rebuilds every table from scratch
export async function createTestSchema() {
    const url = new URL(testDatabaseUrl());
    const name = url.pathname.slice(1);
    url.pathname = "/";
    const server = await mysql.createConnection({ uri: url.toString() });
    await server.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await server.end();

    const conn = await connectTestDb();
    await conn.query(TABLES.map((t) => `DROP TABLE IF EXISTS \`${t}\`;`).join("\n") + SCHEMA);
    await conn.end();
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function ymd(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function mondayOf(date: Date): Date {
    const day = date.getDay();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - (day === 0 ? 6 : day - 1));
}

// Inclusive "YYYY-MM-DD" bounds used by the app's reports
export function weekRange(today: Date): [string, string] {
    const monday = mondayOf(today);
    return [ymd(monday), ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6))];
}

export function monthRange(year: number, month: number): [string, string] {
    return [ymd(new Date(year, month - 1, 1)), ymd(new Date(year, month, 0))];
}

// Seed dates relative to "today": with today = 2026-10-13 (a Tuesday) these are
// Mon 2026-10-12, 2026-10-01, 2026-09-15, 2025-12-20, 2026-10-31 and 2026-11-01.
export function seedDates(today: Date) {
    const y = today.getFullYear();
    const m = today.getMonth();
    return {
        monday: ymd(mondayOf(today)),
        monthStart: ymd(new Date(y, m, 1)),
        prevMonth: ymd(new Date(y, m - 1, 15)),
        lastYear: ymd(new Date(y - 1, 11, 20)),
        monthEnd: ymd(new Date(y, m + 1, 0)),
        nextMonth: ymd(new Date(y, m + 1, 1)),
    };
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

// Empties every table and loads a small, known data set:
//   products 1-6 (5 = "Pudding Cup" has NO stock row, 6 = "Milk Toffee" has 0 stock)
//   stock: Watalappan 100, Yogurt 50, Curd Pot 5, Ice Cream Tub 20, Milk Toffee 0
//   sales #1-#6 and expenses on the seedDates() above
export async function resetDatabase(today: Date = new Date()) {
    const d = seedDates(today);
    const conn = await connectTestDb();
    try {
        await conn.query(TABLES.map((t) => `TRUNCATE TABLE \`${t}\`;`).join("\n"));
        await conn.query(`
            INSERT INTO products (product_id, product_name, description) VALUES
                (1,'Watalappan','Coconut custard pudding'), (2,'Yogurt','Set yogurt cup'), (3,'Curd Pot','Buffalo curd 1L'),
                (4,'Ice Cream Tub','Vanilla 1L'), (5,'Pudding Cup','No stock row'), (6,'Milk Toffee','Zero stock');
            INSERT INTO stocks (product_id, quantity) VALUES (1,100), (2,50), (3,5), (4,20), (6,0);
            INSERT INTO customers (customer_name) VALUES ('Kamal Stores'), ('Nimal Bakery'), ('Sunil Mart');
            INSERT INTO employees (employee_name, employee_address, employee_contact_no, maritial_status) VALUES
                ('Ruwan Perera','Colombo','0771234567','Single'), ('Sanduni Silva','Kandy','0717654321','Married');
            INSERT INTO expenses_list (expense_name) VALUES
                ('Electricity'), ('Transport'), ('Milk Packet(900ml)'), ('Sugar'), ('Watalappan Cup'), ('Drink Cup'),
                ('Salary'), ('Salary Advance'), ('Salary Loan'), ('Return');`);
        await conn.query(
            `INSERT INTO sales (sale_id, customer_name, grand_total, sale_date) VALUES
                (1,'Kamal Stores',1900,?), (2,'Nimal Bakery',2400,?), (3,'Sunil Mart',2700,?),
                (4,'Kamal Stores',560,?), (5,'Nimal Bakery',80,?), (6,'Sunil Mart',170,?)`,
            [d.monday, d.monthStart, d.prevMonth, d.lastYear, d.monthEnd, d.nextMonth]
        );
        await conn.query(`
            INSERT INTO sale_items (sale_id, product_name, quantity, selling_price, total) VALUES
                (1,'Watalappan',10,150,1500), (1,'Yogurt',5,80,400), (2,'Curd Pot',2,1200,2400),
                (3,'Ice Cream Tub',3,900,2700), (4,'Watalappan',4,140,560), (5,'Yogurt',1,80,80), (6,'Yogurt',2,85,170);`);
        await conn.query(
            `INSERT INTO expenses (expense_name, quantity, per_expense_amount, total, expense_date) VALUES
                ('Electricity',1,5000,5000,?), ('Transport',1,1200,1200,?), ('Sugar',10,250,2500,?),
                ('Transport',1,300,300,?), ('Electricity',1,4000,4000,?)`,
            [d.monday, d.monthStart, d.prevMonth, d.monthEnd, d.nextMonth]
        );
    } finally {
        await conn.end();
    }
}

// Convenience for assertions
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const conn = await connectTestDb();
    try {
        const [rows] = await conn.query(sql, params);
        return rows as T[];
    } finally {
        await conn.end();
    }
}

export async function stockOf(productId: number): Promise<number | null> {
    const [row] = await query<{ quantity: number }>("SELECT quantity FROM stocks WHERE product_id = ?", [productId]);
    return row ? Number(row.quantity) : null;
}
