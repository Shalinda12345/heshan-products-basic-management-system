import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { POST as saveExpense } from "@/app/api/expenses/save-expenses/route";
import { GET as stockMovements } from "@/app/api/stock/movements/route";
import { DATABASE_OUTDATED_MESSAGE, DATABASE_UNAVAILABLE_MESSAGE } from "@/app/lib/api-error";
import { get, post } from "../helpers/http";
import { query } from "../helpers/test-db";

const expense = { expense_name: "Electricity", quantity: 1, per_expense_amount: 1000, expense_date: "2026-10-13" };

// What users see when the database is down or hasn't been migrated, instead of a generic "database error"
describe("database problems", () => {
    it("asks for the migration when saving an expense hits a column the database doesn't have yet", async () => {
        await query("ALTER TABLE expenses CHANGE employee_name employee_name_hidden VARCHAR(255) NULL");
        try {
            const { status, body } = await post(saveExpense, "/api/expenses/save-expenses", expense);
            expect(status).toBe(500);
            expect(body).toMatchObject({ success: false, message: DATABASE_OUTDATED_MESSAGE });
        } finally {
            await query("ALTER TABLE expenses CHANGE employee_name_hidden employee_name VARCHAR(255) NULL");
        }
    });

    it("asks for the migration when a report reads a table the database doesn't have yet", async () => {
        await query("RENAME TABLE stock_movements TO stock_movements_hidden");
        try {
            const { status, body } = await get(stockMovements, "/api/stock/movements");
            expect(status).toBe(500);
            expect(body).toEqual({ error: DATABASE_OUTDATED_MESSAGE });
        } finally {
            await query("RENAME TABLE stock_movements_hidden TO stock_movements");
        }
    });

    it("says the database can't be reached when its server is down", async () => {
        // Load the routes again with a connection pool pointing at a port nothing listens on
        const holder = globalThis as { conn?: Pool };
        const currentPool = () => holder.conn;
        const workingPool = holder.conn;
        delete holder.conn;
        vi.stubEnv("DATABASE_URL", "mysql://root@127.0.0.1:1/unreachable");
        vi.resetModules();
        try {
            const { POST: saveWhileDown } = await import("@/app/api/expenses/save-expenses/route");
            const { GET: readWhileDown } = await import("@/app/api/expenses/get-daily-expenses/route");

            const saved = await post(saveWhileDown, "/api/expenses/save-expenses", expense);
            expect(saved.status).toBe(503);
            expect(saved.body).toMatchObject({ success: false, message: DATABASE_UNAVAILABLE_MESSAGE });

            const read = await get(readWhileDown, "/api/expenses/get-daily-expenses");
            expect(read.status).toBe(503);
            expect(read.body).toEqual({ error: DATABASE_UNAVAILABLE_MESSAGE });
        } finally {
            // app/db stored the unreachable pool on globalThis when the routes were re-imported
            await currentPool()?.end();
            holder.conn = workingPool;
            vi.unstubAllEnvs();
            vi.resetModules();
        }
    });
});
