import { describe, expect, it } from "vitest";
import { POST as saveSale } from "@/app/api/sales/save-sales/route";
import { GET as stockList } from "@/app/api/stock/route";
import { post, warmUpConnections } from "../helpers/http";
import { query, stockOf } from "../helpers/test-db";

const invoice = (overrides: Record<string, unknown> = {}) => ({
    customer_name: "Sunil Mart",
    sale_date: "2026-10-13",
    items: [
        { product_name: "Watalappan", quantity: 3, selling_price: 150, total: 450 },
        { product_name: "Yogurt", quantity: 2, selling_price: 80, total: 160 },
    ],
    grand_total: 610,
    ...overrides,
});

async function snapshot() {
    const [counts] = await query("SELECT (SELECT COUNT(*) FROM sales) AS sales, (SELECT COUNT(*) FROM sale_items) AS items");
    const stock = await query("SELECT product_id, quantity FROM stocks ORDER BY product_id");
    return { counts, stock };
}

describe("POST /api/sales/save-sales", () => {
    it("saves the invoice, its lines and deducts stock", async () => {
        const { status, body } = await post(saveSale, "/api/sales/save-sales", invoice());
        expect(status).toBe(201);
        expect(body).toMatchObject({ success: true, message: "Invoice saved successfully!" });

        const [sale] = await query("SELECT * FROM sales WHERE sale_id = ?", [body.sale_id]);
        expect(sale).toMatchObject({ customer_name: "Sunil Mart", sale_date: "2026-10-13", grand_total: 610 });
        const lines = await query("SELECT product_name, quantity, selling_price, total FROM sale_items WHERE sale_id = ? ORDER BY sale_detail_id", [body.sale_id]);
        expect(lines).toEqual([
            { product_name: "Watalappan", quantity: 3, selling_price: 150, total: 450 },
            { product_name: "Yogurt", quantity: 2, selling_price: 80, total: 160 },
        ]);
        expect(await stockOf(1)).toBe(97);
        expect(await stockOf(2)).toBe(48);
    });

    it("trims the customer name and stores the date exactly as entered", async () => {
        const { body } = await post(saveSale, "/api/sales/save-sales", invoice({ customer_name: "  Kamal Stores  ", sale_date: "2026-01-31" }));
        const [sale] = await query("SELECT customer_name, sale_date FROM sales WHERE sale_id = ?", [body.sale_id]);
        expect(sale).toEqual({ customer_name: "Kamal Stores", sale_date: "2026-01-31" });
    });

    it("computes line totals and the grand total itself, ignoring client-sent totals", async () => {
        const { status, body } = await post(saveSale, "/api/sales/save-sales", invoice({
            grand_total: 999999,
            items: [{ product_name: "Yogurt", quantity: 3, selling_price: 33.33, total: 5 }],
        }));
        expect(status).toBe(201);
        const [sale] = await query("SELECT grand_total FROM sales WHERE sale_id = ?", [body.sale_id]);
        const [line] = await query("SELECT total FROM sale_items WHERE sale_id = ?", [body.sale_id]);
        expect(sale.grand_total).toBe(99.99);
        expect(line.total).toBe(99.99);
    });

    it("works when the client omits the totals", async () => {
        const { status } = await post(saveSale, "/api/sales/save-sales", invoice({
            grand_total: undefined,
            items: [{ product_name: "Yogurt", quantity: 1, selling_price: 80 }],
        }));
        expect(status).toBe(201);
    });

    it("rejects a sale above available stock and rolls back every line", async () => {
        const before = await snapshot();
        const { status, body } = await post(saveSale, "/api/sales/save-sales", invoice({
            items: [
                { product_name: "Ice Cream Tub", quantity: 1, selling_price: 900 },
                { product_name: "Curd Pot", quantity: 6, selling_price: 1200 },
            ],
        }));
        expect(status).toBe(400);
        expect(body.message).toBe('Insufficient stock for "Curd Pot". Available: 5, Requested: 6');
        expect(await snapshot()).toEqual(before);
    });

    it("rejects a product that has no stock record", async () => {
        const before = await snapshot();
        const { status, body } = await post(saveSale, "/api/sales/save-sales", invoice({ items: [{ product_name: "Pudding Cup", quantity: 1, selling_price: 10 }] }));
        expect(status).toBe(400);
        expect(body.message).toMatch(/No stock record found for "Pudding Cup"/);
        expect(await snapshot()).toEqual(before);
    });

    it("rejects an unknown product", async () => {
        const { status, body } = await post(saveSale, "/api/sales/save-sales", invoice({ items: [{ product_name: "Ghost", quantity: 1, selling_price: 10 }] }));
        expect(status).toBe(400);
        expect(body.message).toMatch(/Product "Ghost" not found/);
    });

    it.each([
        ["a blank customer", { customer_name: "   " }, "Customer name is required."],
        ["a missing date", { sale_date: "" }, "Sale date is required."],
        ["no items", { items: [] }, "Invoice must contain at least one item."],
        ["a blank product name", { items: [{ product_name: " ", quantity: 1, selling_price: 1 }] }, "Product name is required for all sale items."],
        ["a zero quantity", { items: [{ product_name: "Yogurt", quantity: 0, selling_price: 1 }] }, 'Quantity must be greater than 0 for "Yogurt".'],
        ["a non-numeric quantity", { items: [{ product_name: "Yogurt", quantity: "two", selling_price: 1 }] }, 'Quantity must be greater than 0 for "Yogurt".'],
        ["a negative price", { items: [{ product_name: "Yogurt", quantity: 1, selling_price: -5 }] }, 'Selling price cannot be negative for "Yogurt".'],
        ["a missing price", { items: [{ product_name: "Yogurt", quantity: 1 }] }, 'Selling price cannot be negative for "Yogurt".'],
    ])("rejects %s with a clear message and writes nothing", async (_label, overrides, message) => {
        const before = await snapshot();
        const { status, body } = await post(saveSale, "/api/sales/save-sales", invoice(overrides));
        expect(status).toBe(400);
        expect(body).toEqual({ success: false, message, error: message });
        expect(await snapshot()).toEqual(before);
    });

    it("rejects malformed JSON with 400", async () => {
        expect((await post(saveSale, "/api/sales/save-sales", "{not json")).status).toBe(400);
    });

    it("never oversells when sales for the last units arrive at the same time", async () => {
        await query("UPDATE stocks SET quantity = 5 WHERE product_id = 4");
        await warmUpConnections(stockList, "/api/stock");
        const sale = invoice({ items: [{ product_name: "Ice Cream Tub", quantity: 4, selling_price: 900 }] });
        const results = await Promise.all([1, 2, 3, 4].map(() => post(saveSale, "/api/sales/save-sales", sale)));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1);
        expect(results.filter((r) => r.status === 400)).toHaveLength(3);
        expect(await stockOf(4)).toBe(1);
    });
});
