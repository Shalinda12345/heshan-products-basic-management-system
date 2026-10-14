import { describe, expect, it } from "vitest";
import { GET as dailyExpenses } from "@/app/api/expenses/get-daily-expenses/route";
import { GET as monthlyExpenses } from "@/app/api/expenses/get-monthly-expenses/route";
import { GET as weeklyExpenses } from "@/app/api/expenses/get-weekly-expenses/route";
import { POST as saveExpense } from "@/app/api/expenses/save-expenses/route";
import { get, post } from "../helpers/http";
import { query } from "../helpers/test-db";

// Clock frozen on Tue 2026-10-13. Seeded expenses: Electricity 5000 (10-12), Transport 1200 (10-01),
// Sugar 10x250 (09-15), Transport 300 (10-31), Electricity 4000 (11-01)
const expense = (overrides: Record<string, unknown> = {}) => ({
    expense_name: "Electricity", quantity: 1, per_expense_amount: 1000, total: 1000, expense_date: "2026-10-13", ...overrides,
});
const saved = async (id: number) => (await query("SELECT * FROM expenses WHERE expense_item_id = ?", [id]))[0];
const total = (rows: { total: number }[]) => rows.reduce((sum, r) => sum + r.total, 0);

describe("POST /api/expenses/save-expenses", () => {
    it("records a simple expense on its date", async () => {
        const { status, body } = await post(saveExpense, "/api/expenses/save-expenses", expense());
        expect(status).toBe(201);
        expect(body).toMatchObject({ success: true, message: "Expense saved successfully!" });
        expect(await saved(body.expense_item_id)).toMatchObject({
            expense_name: "Electricity", employee_name: null, quantity: 1, per_expense_amount: 1000, total: 1000, expense_date: "2026-10-13",
        });
    });

    it("records a quantity-based expense as quantity × rate", async () => {
        const { body } = await post(saveExpense, "/api/expenses/save-expenses", expense({ expense_name: "Sugar", quantity: 4, per_expense_amount: 250, total: 1000 }));
        expect(await saved(body.expense_item_id)).toMatchObject({ quantity: 4, per_expense_amount: 250, total: 1000 });
    });

    it("computes the total itself, ignoring a client-sent total", async () => {
        const { body } = await post(saveExpense, "/api/expenses/save-expenses", expense({ quantity: 3, per_expense_amount: 33.33, total: 1 }));
        expect((await saved(body.expense_item_id)).total).toBe(99.99);
    });

    it("defaults the quantity to 1 when omitted", async () => {
        const { body } = await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Transport", per_expense_amount: 350, expense_date: "2026-10-13" });
        expect(await saved(body.expense_item_id)).toMatchObject({ quantity: 1, total: 350 });
    });

    it("records which employee a salary was paid to", async () => {
        const { body } = await post(saveExpense, "/api/expenses/save-expenses", expense({ expense_name: "Salary", per_expense_amount: 45000, employee_name: "  Ruwan Perera " }));
        expect(await saved(body.expense_item_id)).toMatchObject({ expense_name: "Salary", employee_name: "Ruwan Perera", total: 45000 });
    });

    it("stores no employee for a blank employee name", async () => {
        const { body } = await post(saveExpense, "/api/expenses/save-expenses", expense({ employee_name: "  " }));
        expect((await saved(body.expense_item_id)).employee_name).toBeNull();
    });

    it("saves a back-dated expense on its own date", async () => {
        const { body } = await post(saveExpense, "/api/expenses/save-expenses", expense({ expense_date: "2026-10-10" }));
        expect((await saved(body.expense_item_id)).expense_date).toBe("2026-10-10");
    });

    it.each([
        ["a missing name", { expense_name: "" }, "Expense name is required."],
        ["a missing date", { expense_date: "" }, "Expense date is required."],
        ["a negative amount", { per_expense_amount: -1 }, "Per-expense amount cannot be negative."],
        ["a non-numeric amount", { per_expense_amount: "abc" }, "Per-expense amount cannot be negative."],
        ["a negative quantity", { quantity: -2 }, "Quantity must be greater than 0."],
        ["a non-numeric quantity", { quantity: "two" }, "Quantity must be greater than 0."],
    ])("rejects %s with a clear message and writes nothing", async (_label, overrides, message) => {
        const { status, body } = await post(saveExpense, "/api/expenses/save-expenses", expense(overrides));
        expect(status).toBe(400);
        expect(body.message).toBe(message);
        expect((await query("SELECT COUNT(*) AS n FROM expenses"))[0].n).toBe(5);
    });

    it("rejects malformed JSON with 400", async () => {
        expect((await post(saveExpense, "/api/expenses/save-expenses", "{oops")).status).toBe(400);
    });
});

describe("expense reports", () => {
    it("daily lists today's expenses only (the New Expense ledger)", async () => {
        expect((await get(dailyExpenses, "/api/expenses/get-daily-expenses")).body).toEqual([]);
        await post(saveExpense, "/api/expenses/save-expenses", expense());
        await post(saveExpense, "/api/expenses/save-expenses", expense({ expense_date: "2026-10-10" }));
        const { body } = await get(dailyExpenses, "/api/expenses/get-daily-expenses");
        expect(body.map((e: { expense_date: string }) => e.expense_date)).toEqual(["2026-10-13T00:00:00.000Z"]);
    });

    it("weekly covers Monday to Sunday of the current week", async () => {
        const { body } = await get(weeklyExpenses, "/api/expenses/get-weekly-expenses");
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ expense_name: "Electricity", total: 5000 });
    });

    it("monthly covers the current month, newest first", async () => {
        const { body } = await get(monthlyExpenses, "/api/expenses/get-monthly-expenses");
        expect(body.map((e: { total: number }) => e.total)).toEqual([300, 5000, 1200]);
        expect(total(body)).toBe(6500);
    });

    it.each([
        ["2026", "9", 2500],
        ["2026", "11", 4000],
        ["2025", "10", 0],
    ])("monthly for %s-%s (custom report) totals %d", async (year, month, expected) => {
        expect(total((await get(monthlyExpenses, `/api/expenses/get-monthly-expenses?year=${year}&month=${month}`)).body)).toBe(expected);
    });

    it("includes the employee name in report rows", async () => {
        await post(saveExpense, "/api/expenses/save-expenses", expense({ expense_name: "Salary Advance", employee_name: "Sanduni Silva" }));
        const { body } = await get(weeklyExpenses, "/api/expenses/get-weekly-expenses");
        expect(body.find((e: { expense_name: string }) => e.expense_name === "Salary Advance").employee_name).toBe("Sanduni Silva");
    });
});
