import { describe, expect, it } from "vitest";
import { POST as voidSale } from "@/app/api/sales/[id]/void/route";
import { GET as invoices } from "@/app/api/sales/invoices/route";
import { GET as monthlySales } from "@/app/api/sales/get-monthly-sales/route";
import { GET as salesList } from "@/app/api/sales/get-sales-list/route";
import { GET as dashboard } from "@/app/api/dashboard/summary/route";
import { POST as saveSale } from "@/app/api/sales/save-sales/route";
import { PATCH as updateExpense } from "@/app/api/expenses/[id]/route";
import { POST as voidExpense } from "@/app/api/expenses/[id]/void/route";
import { GET as expenseRegister } from "@/app/api/expenses/list/route";
import { GET as monthlyExpenses } from "@/app/api/expenses/get-monthly-expenses/route";
import { GET as dailyExpenses } from "@/app/api/expenses/get-daily-expenses/route";
import { POST as saveExpense } from "@/app/api/expenses/save-expenses/route";
import { POST as saveReturn } from "@/app/api/expenses/save-return-expenses/route";
import { GET as returnsRegister } from "@/app/api/returns/route";
import { POST as voidReturn } from "@/app/api/returns/[id]/void/route";
import { POST as adjustStock } from "@/app/api/stock/adjust/route";
import { POST as moveStock } from "@/app/api/stock/route";
import { get, patch, post } from "../helpers/http";
import { activityLog, query, stockOf } from "../helpers/test-db";

const ledger = () => query("SELECT product_id, direction, movement_type, quantity, balance_after, reference, created_by FROM stock_movements ORDER BY movement_id");
const saleRow = async (id: number) => (await query("SELECT status, void_reason, voided_by, grand_total FROM sales WHERE sale_id = ?", [id]))[0];
const expenseRow = async (id: number) => (await query("SELECT expense_name, employee_name, quantity, per_expense_amount, total, expense_date, status FROM expenses WHERE expense_item_id = ?", [id]))[0];

describe("voiding an invoice", () => {
    const voidIt = (id: number, reason: unknown, as: "admin" | "manager" | "staff" = "admin") =>
        post(voidSale, `/api/sales/${id}/void`, { reason }, { as, params: { id: String(id) } });

    it("puts the items back into stock and keeps the invoice, marked void", async () => {
        const { status, body } = await voidIt(1, "Entered twice by mistake");
        expect(status).toBe(200);
        expect(body.data.restored).toEqual([{ product_name: "Watalappan", quantity: 10 }, { product_name: "Yogurt", quantity: 5 }]);
        expect(await saleRow(1)).toEqual({ status: "void", void_reason: "Entered twice by mistake", voided_by: 1, grand_total: 1900 });
        expect(await stockOf(1)).toBe(110);
        expect(await stockOf(2)).toBe(55);
        expect(await ledger()).toEqual([
            { product_id: 1, direction: "IN", movement_type: "sale_void", quantity: 10, balance_after: 110, reference: "Sale #1", created_by: 1 },
            { product_id: 2, direction: "IN", movement_type: "sale_void", quantity: 5, balance_after: 55, reference: "Sale #1", created_by: 1 },
        ]);
        const [entry] = await activityLog();
        expect(entry).toMatchObject({ action: "sale.void", entity_type: "sale", entity_id: "1" });
        expect(entry.summary).toBe("Voided invoice #1 (Kamal Stores, Rs. 1,900.00): Entered twice by mistake. Returned to stock: 10 × Watalappan, 5 × Yogurt");
    });

    it("takes the invoice out of every report", async () => {
        await voidIt(2, "Customer cancelled");
        expect((await get(monthlySales, "/api/sales/get-monthly-sales")).body.map((s: { sale_id: number }) => s.sale_id)).not.toContain(2);
        expect((await get(salesList, "/api/sales/get-sales-list")).body.map((s: { sale_id: number }) => s.sale_id)).not.toContain(2);
        expect((await get(dashboard, "/api/dashboard/summary?period=month")).body.kpis.totalSales).toBe(1980);
    });

    it("only puts back what is left after returns", async () => {
        await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Watalappan", sale_quantity: 4, sale_per_unit_amount: 150, product_id: 1, expense_date: "2026-10-13",
        });
        await voidIt(1, "Customer returned the rest");
        expect(await stockOf(1)).toBe(110); // 100 + 4 returned + 6 voided
    });

    it.each([
        ["no reason", undefined, 400, /reason for voiding is required/],
        ["a one-letter reason", "x", 400, /short reason/],
    ])("needs a reason (%s)", async (_label, reason, status, message) => {
        const response = await voidIt(1, reason);
        expect(response.status).toBe(status);
        expect(response.body.message).toMatch(message);
        expect((await saleRow(1)).status).toBe("posted");
    });

    it("can't void an invoice twice", async () => {
        await voidIt(1, "Duplicate");
        const { status, body } = await voidIt(1, "Duplicate");
        expect(status).toBe(409);
        expect(body.message).toBe("Invoice #1 is already void.");
        expect(await stockOf(1)).toBe(110);
    });

    it("answers 404 for an unknown invoice", async () => {
        expect((await voidIt(99, "Not real")).status).toBe(404);
    });

    it("is for managers and above", async () => {
        expect((await voidIt(1, "Trying", "staff")).status).toBe(403);
        expect((await voidIt(1, "Customer cancelled", "manager")).status).toBe(200);
    });

    it("refuses returns against a voided invoice", async () => {
        await voidIt(1, "Cancelled");
        const { status, body } = await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Watalappan", sale_quantity: 1, sale_per_unit_amount: 150, product_id: 1, expense_date: "2026-10-13",
        });
        expect(status).toBe(400);
        expect(body.message).toBe("Sale #1 has been voided, so it can't take returns.");
    });
});

describe("GET /api/sales/invoices", () => {
    it("lists invoices newest first with who posted them, totalling only posted ones", async () => {
        const sale = await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Nimal Bakery", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 2, selling_price: 80 }],
        }, { as: "staff" });
        await post(voidSale, "/api/sales/1/void", { reason: "Duplicate" }, { params: { id: "1" } });

        const { status, body } = await get(invoices, "/api/sales/invoices?from=2026-10-01&to=2026-10-31");
        expect(status).toBe(200);
        expect(body.rows.map((r: { sale_id: number; status: string }) => [r.sale_id, r.status])).toEqual([
            [5, "posted"], [sale.body.sale_id, "posted"], [1, "void"], [2, "posted"],
        ]);
        expect(body.rows[1]).toMatchObject({ customer_name: "Nimal Bakery", created_by: "Saman Staff", item_count: 1, sale_date: "2026-10-13" });
        expect(body.rows[2]).toMatchObject({ void_reason: "Duplicate", voided_by: "Asha Admin" });
        expect(body.total).toBe(4);
        expect(body.totals).toEqual({ posted_count: 3, posted_amount: 2640 });
    });

    it.each([
        ["status=void", 0],
        ["customer_id=1", 2],
        ["q=%23", 6],
        ["q=3", 1],
        ["q=bakery", 2],
        ["page=2&page_size=4", 2],
    ])("filters by %s", async (filter, count) => {
        expect((await get(invoices, `/api/sales/invoices?${filter}`)).body.rows).toHaveLength(count);
    });

    it.each(["from=13-10-2026", "status=deleted", "page=0", "page_size=500", "from=2026-10-31&to=2026-10-01"])("rejects %s", async (filter) => {
        expect((await get(invoices, `/api/sales/invoices?${filter}`)).status).toBe(400);
    });
});

describe("correcting and voiding expenses", () => {
    it("corrects an amount, recomputing the total, and logs the before and after", async () => {
        const { status } = await patch(updateExpense, "/api/expenses/1", { per_expense_amount: 5200 }, { params: { id: "1" } });
        expect(status).toBe(200);
        expect(await expenseRow(1)).toMatchObject({ per_expense_amount: 5200, total: 5200 });
        const [entry] = await activityLog();
        expect(entry.summary).toBe("Corrected expense #1 (Electricity): rate Rs. 5,000.00 → Rs. 5,200.00, total Rs. 5,000.00 → Rs. 5,200.00");
    });

    it("moves an expense to another date and category", async () => {
        await patch(updateExpense, "/api/expenses/3", { expense_name: "Milk Packet(900ml)", quantity: 4, expense_date: "2026-10-02" }, { params: { id: "3" } });
        expect(await expenseRow(3)).toMatchObject({ expense_name: "Milk Packet(900ml)", quantity: 4, total: 1000, expense_date: "2026-10-02" });
    });

    it("needs an employee when corrected into a salary category", async () => {
        const { status, body } = await patch(updateExpense, "/api/expenses/1", { expense_name: "Salary" }, { params: { id: "1" } });
        expect(status).toBe(400);
        expect(body.message).toBe("Choose the employee for this Salary entry.");
    });

    it("voids an expense, which leaves the totals but stays on file", async () => {
        const { status } = await post(voidExpense, "/api/expenses/2/void", { reason: "Paid by the customer" }, { params: { id: "2" } });
        expect(status).toBe(200);
        expect((await expenseRow(2)).status).toBe("void");
        expect((await get(monthlyExpenses, "/api/expenses/get-monthly-expenses")).body.map((e: { total: number }) => e.total)).toEqual([300, 5000]);
        expect((await patch(updateExpense, "/api/expenses/2", { per_expense_amount: 1 }, { params: { id: "2" } })).status).toBe(409);
    });

    it("leaves expenses created by a return to the return", async () => {
        const ret = await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 1, per_unit_amount: 80, expense_date: "2026-10-13",
        });
        const id = ret.body.expense_item_id;
        const { status, body } = await post(voidExpense, `/api/expenses/${id}/void`, { reason: "Wrong" }, { params: { id: String(id) } });
        expect(status).toBe(409);
        expect(body.message).toBe(`Expense #${id} was created by return #${ret.body.return_id}. Void the return instead.`);
    });

    it("is for managers and above", async () => {
        expect((await post(voidExpense, "/api/expenses/1/void", { reason: "Nope" }, { as: "staff", params: { id: "1" } })).status).toBe(403);
    });

    it("lists the register with filters, and shows staff only their own entries in the daily ledger", async () => {
        await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Transport", per_expense_amount: 250, expense_date: "2026-10-13" }, { as: "staff" });
        await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Electricity", per_expense_amount: 900, expense_date: "2026-10-13" });

        const register = await get(expenseRegister, "/api/expenses/list?from=2026-10-13&to=2026-10-13");
        expect(register.body.rows.map((r: { total: number; created_by: string }) => [r.total, r.created_by])).toEqual([[900, "Asha Admin"], [250, "Saman Staff"]]);
        expect(register.body.totals).toEqual({ posted_count: 2, posted_amount: 1150 });
        expect((await get(expenseRegister, "/api/expenses/list?category=Transport")).body.total).toBe(3);
        expect((await get(expenseRegister, "/api/expenses/list", { as: "staff" })).status).toBe(403);

        expect((await get(dailyExpenses, "/api/expenses/get-daily-expenses", { as: "staff" })).body.map((e: { total: number }) => e.total)).toEqual([250]);
        expect((await get(dailyExpenses, "/api/expenses/get-daily-expenses")).body).toHaveLength(2);
    });
});

describe("voiding returns", () => {
    const send = (body: Record<string, unknown>) => post(saveReturn, "/api/expenses/save-return-expenses", { expense_date: "2026-10-13", ...body });
    const voidIt = (id: number, reason = "Entered by mistake") => post(voidReturn, `/api/returns/${id}/void`, { reason }, { params: { id: String(id) } });

    it("reverses a stock write-off: stock comes back and its expense is voided", async () => {
        const ret = await send({ return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 3, per_unit_amount: 80 });
        expect(await stockOf(2)).toBe(47);
        const { status } = await voidIt(ret.body.return_id);
        expect(status).toBe(200);
        expect(await stockOf(2)).toBe(50);
        expect((await expenseRow(ret.body.expense_item_id)).status).toBe("void");
        expect((await query("SELECT status FROM returns"))[0].status).toBe("void");
        expect((await ledger()).map((m) => m.movement_type)).toEqual(["write_off", "write_off_reversal"]);
    });

    it("reverses a sale return: the invoice line comes back and the goods leave stock again", async () => {
        const ret = await send({ return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Watalappan", sale_quantity: 2, sale_per_unit_amount: 150, product_id: 1 });
        await voidIt(ret.body.return_id);
        expect((await query("SELECT quantity, total FROM sale_items WHERE sale_id = 1 AND product_name = 'Watalappan'"))[0]).toEqual({ quantity: 10, total: 1500 });
        expect((await saleRow(1)).grand_total).toBe(1900);
        expect(await stockOf(1)).toBe(100);
    });

    it("reverses a write-off return: the invoice comes back and the expense is voided", async () => {
        const ret = await send({ return_type: "sale_reduction_expense_return", sale_id: 2, sale_product_name: "Curd Pot", sale_quantity: 1, sale_per_unit_amount: 1200, expense_per_unit_amount: 500 });
        await voidIt(ret.body.return_id);
        expect((await saleRow(2)).grand_total).toBe(2400);
        expect((await expenseRow(ret.body.expense_item_id)).status).toBe("void");
        expect(await stockOf(3)).toBe(5);
    });

    it("refuses to take returned goods out of stock when they have been sold since", async () => {
        const ret = await send({ return_type: "sale_reduction_return", sale_id: 2, sale_product_name: "Curd Pot", sale_quantity: 2, sale_per_unit_amount: 1200, product_id: 3 });
        await post(moveStock, "/api/stock", { product_id: 3, quantity: 7, direction: "OUT", movement_type: "damaged" });
        const { status, body } = await voidIt(ret.body.return_id);
        expect(status).toBe(400);
        expect(body.message).toBe(`Cannot reverse return #${ret.body.return_id}: it put 2 × Curd Pot into stock, but only 0 are left.`);
        expect((await saleRow(2)).grand_total).toBe(0);
    });

    it("can't reverse a return on a voided invoice, or void a return twice", async () => {
        const ret = await send({ return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Yogurt", sale_quantity: 1, sale_per_unit_amount: 80, product_id: 2 });
        await post(voidSale, "/api/sales/1/void", { reason: "Cancelled" }, { params: { id: "1" } });
        expect((await voidIt(ret.body.return_id)).status).toBe(409);

        const other = await send({ return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 1, per_unit_amount: 80 });
        await voidIt(other.body.return_id);
        expect((await voidIt(other.body.return_id)).body.message).toBe(`Return #${other.body.return_id} is already void.`);
    });

    it("lists returns with their invoice's customer", async () => {
        await send({ return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Watalappan", sale_quantity: 2, sale_per_unit_amount: 150, product_id: 1 });
        const { status, body } = await get(returnsRegister, "/api/returns");
        expect(status).toBe(200);
        expect(body.rows).toEqual([expect.objectContaining({
            return_type: "sale_reduction_return", product_name: "Watalappan", quantity: 2, total: 300, customer_name: "Kamal Stores", created_by: "Asha Admin", status: "posted", return_date: "2026-10-13",
        })]);
        expect((await get(returnsRegister, "/api/returns", { as: "staff" })).status).toBe(403);
    });

    it("logs who processed and who voided each return", async () => {
        const ret = await send({ return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 1, per_unit_amount: 80 });
        await voidIt(ret.body.return_id, "Counted wrong");
        expect((await activityLog()).map((e) => e.action)).toEqual(["return.create", "return.void"]);
    });
});

describe("stock counts", () => {
    const count = (body: Record<string, unknown>, as: "admin" | "staff" = "admin") => post(adjustStock, "/api/stock/adjust", body, { as });

    it("corrects stock down to the counted quantity", async () => {
        const { status, body } = await count({ product_id: 1, counted_quantity: 96, note: "Monthly count" });
        expect(status).toBe(200);
        expect(body.data).toMatchObject({ before: 100, counted: 96, difference: -4 });
        expect(await stockOf(1)).toBe(96);
        expect(await ledger()).toEqual([
            { product_id: 1, direction: "OUT", movement_type: "adjustment_out", quantity: 4, balance_after: 96, reference: "Stock count", created_by: 1 },
        ]);
        expect((await activityLog())[0].summary).toBe("Stock count for Watalappan: system 100, counted 96 (−4). Note: Monthly count");
    });

    it("corrects stock up, creating the stock record of a product that had none", async () => {
        await count({ product_id: 5, counted_quantity: 12 });
        expect(await stockOf(5)).toBe(12);
    });

    it("records a count that matches without moving stock", async () => {
        const { body } = await count({ product_id: 3, counted_quantity: 5 });
        expect(body.message).toMatch(/matches/);
        expect(await ledger()).toEqual([]);
        expect((await activityLog())[0].summary).toBe("Stock count for Curd Pot: 5, matches the system");
    });

    it.each([
        ["a negative count", { product_id: 1, counted_quantity: -1 }, 400],
        ["no count", { product_id: 1 }, 400],
        ["an unknown product", { product_id: 99, counted_quantity: 1 }, 404],
        ["a future date", { product_id: 1, counted_quantity: 1, movement_date: "2026-10-20" }, 400],
    ])("rejects %s", async (_label, body, status) => {
        expect((await count(body)).status).toBe(status);
        expect(await stockOf(1)).toBe(100);
    });

    it("is for managers and above", async () => {
        expect((await count({ product_id: 1, counted_quantity: 1 }, "staff")).status).toBe(403);
    });
});
