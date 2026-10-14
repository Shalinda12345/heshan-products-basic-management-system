import { describe, expect, it } from "vitest";
import { POST as saveReturn } from "@/app/api/expenses/save-return-expenses/route";
import { GET as stockList } from "@/app/api/stock/route";
import { post, warmUpConnections } from "../helpers/http";
import { query, stockOf } from "../helpers/test-db";

// Seeded sale #1: Watalappan 10 @150 (1500) + Yogurt 5 @80 (400) = 1900. Sale #2: Curd Pot 2 @1200 = 2400.
const URL_ = "/api/expenses/save-return-expenses";
const send = (body: Record<string, unknown>) => post(saveReturn, URL_, { expense_date: "2026-10-13", ...body });

async function state() {
    const [counts] = await query("SELECT (SELECT COUNT(*) FROM expenses) AS expenses, (SELECT COUNT(*) FROM returns) AS returns");
    const sales = await query("SELECT sale_id, grand_total FROM sales ORDER BY sale_id");
    const lines = await query("SELECT sale_detail_id, quantity, total FROM sale_items ORDER BY sale_detail_id");
    const stock = await query("SELECT product_id, quantity FROM stocks ORDER BY product_id");
    const ledger = await query("SELECT * FROM stock_movements");
    return { counts, sales, lines, stock, ledger };
}
const line = async (saleId: number, product: string) =>
    (await query("SELECT quantity, total FROM sale_items WHERE sale_id = ? AND product_name = ?", [saleId, product]))[0];
const grandTotal = async (saleId: number) => (await query("SELECT grand_total FROM sales WHERE sale_id = ?", [saleId]))[0].grand_total;

describe("stock expense return (damaged stock written off)", () => {
    const body = { return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 3, per_unit_amount: 80 };

    it("deducts stock, records the expense and an audit row", async () => {
        const { status, body: result } = await send(body);
        expect(status).toBe(201);
        expect(await stockOf(2)).toBe(47);
        const [expense] = await query("SELECT * FROM expenses WHERE expense_item_id = ?", [result.expense_item_id]);
        expect(expense).toMatchObject({ expense_name: "Stock Expense Return: Yogurt", quantity: 3, per_expense_amount: 80, total: 240, expense_date: "2026-10-13" });
        const [audit] = await query("SELECT * FROM returns");
        expect(audit).toMatchObject({ return_type: "stock_expense_return", product_name: "Yogurt", total: 240, expense_item_id: result.expense_item_id, sale_id: null, return_date: "2026-10-13" });
        expect(await query("SELECT product_id, direction, movement_type, quantity, balance_after, reference FROM stock_movements")).toEqual([
            { product_id: 2, direction: "OUT", movement_type: "write_off", quantity: 3, balance_after: 47, reference: `Expense #${result.expense_item_id}` },
        ]);
    });

    it("rejects more than the available stock and changes nothing", async () => {
        const before = await state();
        const { status, body: result } = await send({ ...body, product_id: 3, product_name: "Curd Pot", quantity: 6 });
        expect(status).toBe(400);
        expect(result.message).toMatch(/Insufficient stock/);
        expect(await state()).toEqual(before);
    });

    it("rejects a product without a stock record", async () => {
        const { status, body: result } = await send({ ...body, product_id: 5, product_name: "Pudding Cup" });
        expect(status).toBe(400);
        expect(result.message).toMatch(/No stock record/);
    });

    it.each([
        ["no product", { product_id: undefined }],
        ["a zero quantity", { quantity: 0 }],
        ["a non-numeric quantity", { quantity: "x" }],
        ["no amount", { per_unit_amount: undefined }],
    ])("rejects %s with 400", async (_label, overrides) => {
        expect((await send({ ...body, ...overrides })).status).toBe(400);
    });
});

describe("sale reduction return (goods back into stock)", () => {
    const body = { return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Watalappan", sale_quantity: 2, sale_per_unit_amount: 150, product_id: 1 };

    it("reduces the sale line and total, and credits the chosen stock", async () => {
        const { status } = await send(body);
        expect(status).toBe(201);
        expect(await line(1, "Watalappan")).toEqual({ quantity: 8, total: 1200 });
        expect(await grandTotal(1)).toBe(1600);
        expect(await stockOf(1)).toBe(102);
        const [audit] = await query("SELECT return_type, sale_id, total, expense_item_id FROM returns");
        expect(audit).toEqual({ return_type: "sale_reduction_return", sale_id: 1, total: 300, expense_item_id: null });
        expect((await query("SELECT COUNT(*) AS n FROM expenses"))[0].n).toBe(5);
        expect(await query("SELECT product_id, direction, movement_type, quantity, balance_after, reference, note FROM stock_movements")).toEqual([
            { product_id: 1, direction: "IN", movement_type: "sale_return", quantity: 2, balance_after: 102, reference: "Sale #1", note: null },
        ]);
    });

    it("can return the whole line", async () => {
        await send({ ...body, sale_quantity: 10 });
        expect(await line(1, "Watalappan")).toEqual({ quantity: 0, total: 0 });
        expect(await grandTotal(1)).toBe(400);
    });

    it("rejects returning more units than were sold", async () => {
        const before = await state();
        const { status, body: result } = await send({ ...body, sale_quantity: 11 });
        expect(status).toBe(400);
        expect(result.message).toBe("Cannot return 11 units — only 10 were sold in this transaction.");
        expect(await state()).toEqual(before);
    });

    it("rejects a refund larger than what the line still holds, keeping the sale consistent", async () => {
        const before = await state();
        const { status, body: result } = await send({ ...body, sale_product_name: "Yogurt", sale_quantity: 1, sale_per_unit_amount: 1000, product_id: 2 });
        expect(status).toBe(400);
        expect(result.message).toBe('Return amount Rs. 1000.00 exceeds the Rs. 400.00 remaining for "Yogurt" in Sale #1.');
        expect(await state()).toEqual(before);
    });

    it("rolls back the sale reduction when the stock to credit does not exist", async () => {
        const before = await state();
        const { status, body: result } = await send({ ...body, product_id: 5 });
        expect(status).toBe(400);
        expect(result.message).toMatch(/No stock record found for product ID 5/);
        expect(await state()).toEqual(before);
    });

    it.each([
        ["an unknown sale", { sale_id: 4242 }, /Sale ID 4242 not found/],
        ["a product not on the sale", { sale_product_name: "Curd Pot" }, /No sale item matching "Curd Pot"/],
        ["no stock item to credit", { product_id: undefined }, /stock item must be selected/],
        ["a zero quantity", { sale_quantity: 0 }, /are required/],
    ])("rejects %s", async (_label, overrides, message) => {
        const { status, body: result } = await send({ ...body, ...overrides });
        expect(status).toBe(400);
        expect(result.message).toMatch(message);
    });

    it("never returns more than was sold when two returns arrive at once", async () => {
        await warmUpConnections(stockList, "/api/stock");
        const results = await Promise.all([1, 2].map(() => send({ ...body, sale_quantity: 6 })));
        expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
        expect(await line(1, "Watalappan")).toEqual({ quantity: 4, total: 600 });
        expect(await stockOf(1)).toBe(106);
    });
});

describe("sale reduction expense return (goods written off)", () => {
    const body = {
        return_type: "sale_reduction_expense_return", sale_id: 2, sale_product_name: "Curd Pot",
        sale_quantity: 1, sale_per_unit_amount: 1200, expense_per_unit_amount: 500,
    };

    it("reduces the sale and records a write-off expense without touching stock", async () => {
        const { status, body: result } = await send(body);
        expect(status).toBe(201);
        expect(await line(2, "Curd Pot")).toEqual({ quantity: 1, total: 1200 });
        expect(await grandTotal(2)).toBe(1200);
        expect(await stockOf(3)).toBe(5);
        const [expense] = await query("SELECT expense_name, quantity, per_expense_amount, total FROM expenses WHERE expense_item_id = ?", [result.expense_item_id]);
        expect(expense).toEqual({ expense_name: "Sale Reduction Expense Return: Curd Pot", quantity: 1, per_expense_amount: 500, total: 500 });
        const [audit] = await query("SELECT return_type, sale_id, total, stock_id FROM returns");
        expect(audit).toEqual({ return_type: "sale_reduction_expense_return", sale_id: 2, total: 1200, stock_id: null });
    });

    it("requires the write-off rate", async () => {
        const { status, body: result } = await send({ ...body, expense_per_unit_amount: undefined });
        expect(status).toBe(400);
        expect(result.message).toMatch(/expense_per_unit_amount/);
    });

    it("rejects returning more units than were sold and changes nothing", async () => {
        const before = await state();
        expect((await send({ ...body, sale_quantity: 3 })).status).toBe(400);
        expect(await state()).toEqual(before);
    });
});

describe("return request validation", () => {
    it("rejects an unknown return type", async () => {
        const { status, body } = await send({ return_type: "refund_everything" });
        expect(status).toBe(400);
        expect(body.message).toBe("Invalid or missing return_type.");
    });

    it("requires a date", async () => {
        const { status, body } = await post(saveReturn, URL_, { return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 1, per_unit_amount: 1 });
        expect(status).toBe(400);
        expect(body.message).toBe("expense_date is required.");
    });
});
