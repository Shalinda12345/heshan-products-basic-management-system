// Test database helpers shared by the Vitest API tests and the Playwright E2E tests.
// Tests wipe and re-seed the database, so they only ever run against TEST_DATABASE_URL,
// and only when that database's name ends in "_test".
import { config as loadEnv } from "dotenv";
import mysql from "mysql2/promise";
import { runMigrations } from "@/app/db/migrations";
import { hashPassword } from "@/app/lib/password";
import type { Role } from "@/app/lib/permissions";
import { SESSION_COOKIE, createSessionToken } from "@/app/lib/session";

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

export async function connectTestDb(url = testDatabaseUrl()) {
    return mysql.createConnection({ uri: url, dateStrings: true, multipleStatements: true });
}

export const TABLES = [
    "users", "products", "customers", "sales", "sale_items", "expenses_list", "expenses", "stocks", "employees",
    "returns", "stock_movements", "activity_log",
];

// Creates a test database (if needed) on the test server and returns its URL
export async function ensureTestDatabase(url = testDatabaseUrl()): Promise<string> {
    const serverUrl = new URL(url);
    const name = serverUrl.pathname.slice(1);
    serverUrl.pathname = "/";
    const server = await mysql.createConnection({ uri: serverUrl.toString() });
    try {
        await server.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    } finally {
        await server.end();
    }
    return url;
}

// Creates the test database (if needed) and builds every table from scratch with the app's own migrations
export async function createTestSchema() {
    await ensureTestDatabase();
    const conn = await connectTestDb();
    try {
        await conn.query(TABLES.map((t) => `DROP TABLE IF EXISTS \`${t}\`;`).join("\n"));
        await runMigrations(conn);
    } finally {
        await conn.end();
    }
}

// ─── Users ────────────────────────────────────────────────────────────────────

// Every seeded account signs in with this password ("disabled" is switched off)
export const TEST_PASSWORD = "Test-passw0rd";

export const TEST_USERS = {
    admin: { id: 1, username: "admin", name: "Asha Admin", role: "admin" },
    owner: { id: 2, username: "owner", name: "Oshan Owner", role: "owner" },
    manager: { id: 3, username: "manager", name: "Mala Manager", role: "manager" },
    staff: { id: 4, username: "staff", name: "Saman Staff", role: "staff" },
    disabled: { id: 5, username: "former", name: "Former Staff", role: "staff" },
} as const satisfies Record<string, { id: number; username: string; name: string; role: Role }>;

export type TestUser = keyof typeof TEST_USERS;

let passwordHash: Promise<string> | undefined;
// Hashing is deliberately slow, so the seed reuses one hash of TEST_PASSWORD
function testPasswordHash(): Promise<string> {
    passwordHash ??= hashPassword(TEST_PASSWORD);
    return passwordHash;
}

// A session token for a seeded user, as the browser holds it after signing in
export function sessionTokenFor(user: TestUser, now = Date.now()): Promise<string> {
    const { id, role } = TEST_USERS[user];
    return createSessionToken({ userId: id, version: 1, role, mustChangePassword: false }, now);
}

export async function sessionCookieFor(user: TestUser): Promise<string> {
    return `${SESSION_COOKIE}=${await sessionTokenFor(user)}`;
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
//   users 1-5 (see TEST_USERS), all with TEST_PASSWORD
//   products 1-6 (5 = "Pudding Cup" has NO stock row, 6 = "Milk Toffee" has 0 stock)
//   stock: Watalappan 100, Yogurt 50, Curd Pot 5, Ice Cream Tub 20, Milk Toffee 0
//   customers 1-3, employees 1-2, expense categories 1-10 (with their kinds)
//   sales #1-#6 and expenses on the seedDates() above
export async function resetDatabase(today: Date = new Date()) {
    const d = seedDates(today);
    const conn = await connectTestDb();
    try {
        // Ids restart at 1 because tests refer to them ("Invoice #7"). DELETE and resetting the counter is several
        // times faster than TRUNCATE, which recreates every table's file.
        await conn.query(TABLES.map((t) => `DELETE FROM \`${t}\`; ALTER TABLE \`${t}\` AUTO_INCREMENT = 1;`).join("\n"));
        const hash = await testPasswordHash();
        await conn.query(
            "INSERT INTO users (id, username, name, role, password_hash, is_active) VALUES ?",
            [Object.entries(TEST_USERS).map(([key, u]) => [u.id, u.username, u.name, u.role, hash, key === "disabled" ? 0 : 1])]
        );
        await conn.query(`
            INSERT INTO products (product_id, product_name, description) VALUES
                (1,'Watalappan','Coconut custard pudding'), (2,'Yogurt','Set yogurt cup'), (3,'Curd Pot','Buffalo curd 1L'),
                (4,'Ice Cream Tub','Vanilla 1L'), (5,'Pudding Cup','No stock row'), (6,'Milk Toffee','Zero stock');
            INSERT INTO stocks (product_id, quantity) VALUES (1,100), (2,50), (3,5), (4,20), (6,0);
            INSERT INTO customers (customer_id, customer_name) VALUES (1,'Kamal Stores'), (2,'Nimal Bakery'), (3,'Sunil Mart');
            INSERT INTO employees (employee_name, employee_address, employee_contact_no, maritial_status) VALUES
                ('Ruwan Perera','Colombo','0771234567','Single'), ('Sanduni Silva','Kandy','0717654321','Married');
            INSERT INTO expenses_list (expense_name, kind) VALUES
                ('Electricity','standard'), ('Transport','standard'), ('Milk Packet(900ml)','quantity'), ('Sugar','quantity'),
                ('Watalappan Cup','quantity'), ('Drink Cup','quantity'), ('Salary','salary'), ('Salary Advance','salary'),
                ('Salary Loan','salary'), ('Return','return');`);
        await conn.query(
            `INSERT INTO sales (sale_id, customer_id, customer_name, grand_total, sale_date) VALUES
                (1,1,'Kamal Stores',1900,?), (2,2,'Nimal Bakery',2400,?), (3,3,'Sunil Mart',2700,?),
                (4,1,'Kamal Stores',560,?), (5,2,'Nimal Bakery',80,?), (6,3,'Sunil Mart',170,?)`,
            [d.monday, d.monthStart, d.prevMonth, d.lastYear, d.monthEnd, d.nextMonth]
        );
        await conn.query(`
            INSERT INTO sale_items (sale_id, product_id, product_name, quantity, selling_price, total) VALUES
                (1,1,'Watalappan',10,150,1500), (1,2,'Yogurt',5,80,400), (2,3,'Curd Pot',2,1200,2400),
                (3,4,'Ice Cream Tub',3,900,2700), (4,1,'Watalappan',4,140,560), (5,2,'Yogurt',1,80,80), (6,2,'Yogurt',2,85,170);`);
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

// The activity log, oldest first, as the assertions need it
export async function activityLog(): Promise<{ user_id: number | null; username: string | null; action: string; entity_type: string | null; entity_id: string | null; summary: string; details: unknown }[]> {
    const rows = await query<{ user_id: number | null; username: string | null; action: string; entity_type: string | null; entity_id: string | null; summary: string; details: string | null }>(
        "SELECT user_id, username, action, entity_type, entity_id, summary, details FROM activity_log ORDER BY activity_id"
    );
    return rows.map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));
}
