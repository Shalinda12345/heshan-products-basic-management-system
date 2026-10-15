import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/stock/route";
import { GET as movementsGet } from "@/app/api/stock/movements/route";
import { POST as saveSale } from "@/app/api/sales/save-sales/route";
import { get, post, warmUpConnections } from "../helpers/http";
import { query, stockOf } from "../helpers/test-db";

type Movement = {
    product_id: number; direction: string; movement_type: string; quantity: number; balance_after: number;
    reference: string | null; note: string | null; movement_date: string;
};

const movements = () =>
    query<Movement>(
        "SELECT product_id, direction, movement_type, quantity, balance_after, reference, note, movement_date FROM stock_movements ORDER BY movement_id"
    );

describe("GET /api/stock", () => {
    it("lists every product with its stock level", async () => {
        const { status, body } = await get(GET, "/api/stock");
        expect(status).toBe(200);
        expect(body).toHaveLength(6);
        expect(body.find((p: { product_id: number }) => p.product_id === 1)).toMatchObject({
            product_id: 1, product_name: "Watalappan", description: "Coconut custard pudding", quantity: 100, today_in: 0, today_out: 0,
        });
    });

    it("shows 0 for a product that has no stock row yet", async () => {
        const { body } = await get(GET, "/api/stock");
        expect(body.find((p: { product_id: number }) => p.product_id === 5).quantity).toBe(0);
    });
});

describe("POST /api/stock (record stock inflow)", () => {
    it("adds to an existing stock level and returns the new total", async () => {
        const { status, body } = await post(POST, "/api/stock", { product_id: 1, quantity: 5 });
        expect(status).toBe(200);
        expect(body).toEqual({
            success: true,
            data: { product_id: 1, quantity: 105, movement_id: 1, direction: "IN", movement_type: "production" },
        });
        expect(await stockOf(1)).toBe(105);
    });

    it("creates the stock row for a product's first inflow", async () => {
        const { status, body } = await post(POST, "/api/stock", { product_id: 5, quantity: 12 });
        expect(status).toBe(200);
        expect(body.data.quantity).toBe(12);
        expect(await stockOf(5)).toBe(12);
    });

    it("accepts numeric strings", async () => {
        expect((await post(POST, "/api/stock", { product_id: "2", quantity: "3" })).status).toBe(200);
        expect(await stockOf(2)).toBe(53);
    });

    it("returns 404 for an unknown product", async () => {
        const { status, body } = await post(POST, "/api/stock", { product_id: 999, quantity: 1 });
        expect(status).toBe(404);
        expect(body.error).toMatch(/not found/);
    });

    it.each([
        ["zero quantity", { product_id: 1, quantity: 0 }],
        ["negative quantity", { product_id: 1, quantity: -3 }],
        ["non-numeric quantity", { product_id: 1, quantity: "abc" }],
        ["missing quantity", { product_id: 1 }],
        ["missing product", { quantity: 3 }],
        ["fractional product id", { product_id: 1.5, quantity: 3 }],
    ])("rejects %s with 400 and changes nothing", async (_label, body) => {
        const response = await post(POST, "/api/stock", body);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Product ID and a positive quantity are required.");
        expect(await stockOf(1)).toBe(100);
    });

    it("keeps every unit when inflows for the same product arrive at once", async () => {
        await warmUpConnections(GET, "/api/stock");
        const results = await Promise.all(Array.from({ length: 5 }, () => post(POST, "/api/stock", { product_id: 5, quantity: 2 })));
        expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
        expect(await stockOf(5)).toBe(10);
        expect((await movements()).map((m) => m.balance_after)).toEqual([2, 4, 6, 8, 10]);
    });
});

describe("stock ledger", () => {
    it("logs a manual stock-in with the balance after it", async () => {
        await post(POST, "/api/stock", { product_id: 3, quantity: 7, note: "Morning batch" });
        expect(await movements()).toEqual([{
            product_id: 3, direction: "IN", movement_type: "production", quantity: 7, balance_after: 12,
            reference: "Manual entry", note: "Morning batch", movement_date: "2026-10-13",
        }]);
    });

    it("records a manual stock-out and its reason", async () => {
        const { status, body } = await post(POST, "/api/stock", { product_id: 2, quantity: 4, direction: "OUT", movement_type: "damaged" });
        expect(status).toBe(200);
        expect(body.data).toMatchObject({ quantity: 46, direction: "OUT", movement_type: "damaged" });
        expect(await stockOf(2)).toBe(46);
        expect((await movements())[0]).toMatchObject({ direction: "OUT", movement_type: "damaged", quantity: 4, balance_after: 46 });
    });

    it("refuses a stock-out larger than the stock and changes nothing", async () => {
        const { status, body } = await post(POST, "/api/stock", { product_id: 3, quantity: 6, direction: "OUT" });
        expect(status).toBe(400);
        expect(body.error).toBe('Insufficient stock for "Curd Pot". Available: 5, Requested: 6');
        expect(await stockOf(3)).toBe(5);
        expect(await movements()).toEqual([]);
    });

    it("refuses a stock-out for a product with no stock row", async () => {
        const { status, body } = await post(POST, "/api/stock", { product_id: 5, quantity: 1, direction: "OUT" });
        expect(status).toBe(400);
        expect(body.error).toMatch(/No stock record found for "Pudding Cup"/);
    });

    it.each([
        ["an unknown direction", { product_id: 1, quantity: 1, direction: "SIDEWAYS" }, /Direction must be/],
        ["a sale reason typed by hand", { product_id: 1, quantity: 1, direction: "OUT", movement_type: "sale" }, /must be one of/],
        ["a stock-out reason on a stock-in", { product_id: 1, quantity: 1, movement_type: "damaged" }, /must be one of/],
        ["an invalid date", { product_id: 1, quantity: 1, movement_date: "2026-02-30" }, /valid YYYY-MM-DD/],
        ["a future date", { product_id: 1, quantity: 1, movement_date: "2026-10-14" }, /cannot be in the future/],
    ])("rejects %s", async (_label, body, message) => {
        const response = await post(POST, "/api/stock", body);
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(message);
        expect(await movements()).toEqual([]);
    });

    it("won't receive stock for an inactive product, but still lets it be removed", async () => {
        await query("UPDATE products SET is_active = 0 WHERE product_id = 1");
        const refused = await post(POST, "/api/stock", { product_id: 1, quantity: 5 });
        expect(refused.status).toBe(400);
        expect(refused.body.error).toBe('"Watalappan" is inactive. Reactivate it on the Products page before receiving stock.');
        expect((await post(POST, "/api/stock", { product_id: 1, quantity: 5, direction: "OUT", movement_type: "damaged" })).status).toBe(200);
        expect(await stockOf(1)).toBe(95);
    });

    it("accepts a back-dated movement", async () => {
        await post(POST, "/api/stock", { product_id: 1, quantity: 2, movement_date: "2026-10-01" });
        expect((await movements())[0].movement_date).toBe("2026-10-01");
    });

    it("logs every sold line as a stock-out referencing the invoice", async () => {
        await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Kamal Stores", sale_date: "2026-10-13",
            items: [{ product_name: "Watalappan", quantity: 3, selling_price: 150 }, { product_name: "Yogurt", quantity: 2, selling_price: 80 }],
        });
        expect(await movements()).toEqual([
            { product_id: 1, direction: "OUT", movement_type: "sale", quantity: 3, balance_after: 97, reference: "Sale #7", note: "Kamal Stores", movement_date: "2026-10-13" },
            { product_id: 2, direction: "OUT", movement_type: "sale", quantity: 2, balance_after: 48, reference: "Sale #7", note: "Kamal Stores", movement_date: "2026-10-13" },
        ]);
    });

    it("leaves no ledger rows behind when a sale is rolled back", async () => {
        await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Kamal Stores", sale_date: "2026-10-13",
            items: [{ product_name: "Watalappan", quantity: 3, selling_price: 150 }, { product_name: "Curd Pot", quantity: 99, selling_price: 80 }],
        });
        expect(await movements()).toEqual([]);
        expect(await stockOf(1)).toBe(100);
    });

    it("totals today's ins and outs per product in GET /api/stock", async () => {
        await post(POST, "/api/stock", { product_id: 1, quantity: 10 });
        await post(POST, "/api/stock", { product_id: 1, quantity: 4, direction: "OUT", movement_type: "internal_use" });
        await post(POST, "/api/stock", { product_id: 1, quantity: 50, movement_date: "2026-10-01" }); // not today
        const { body } = await get(GET, "/api/stock");
        expect(body.find((p: { product_id: number }) => p.product_id === 1)).toMatchObject({ quantity: 156, today_in: 10, today_out: 4 });
    });

    it("keeps balances exact when stock-outs race each other", async () => {
        await warmUpConnections(GET, "/api/stock");
        const results = await Promise.all(
            Array.from({ length: 4 }, () => post(POST, "/api/stock", { product_id: 3, quantity: 2, direction: "OUT" }))
        );
        expect(results.map((r) => r.status).sort()).toEqual([200, 200, 400, 400]);
        expect(await stockOf(3)).toBe(1);
        expect((await movements()).map((m) => m.balance_after)).toEqual([3, 1]);
    });
});

describe("GET /api/stock/movements", () => {
    async function seedMovements() {
        await post(POST, "/api/stock", { product_id: 1, quantity: 10 });
        await post(POST, "/api/stock", { product_id: 2, quantity: 5, direction: "OUT", movement_type: "damaged" });
        await post(POST, "/api/stock", { product_id: 1, quantity: 3, movement_date: "2026-10-01" });
    }

    it("lists the ledger newest first", async () => {
        await seedMovements();
        const { status, body } = await get(movementsGet, "/api/stock/movements");
        expect(status).toBe(200);
        expect(body.map((m: Movement) => [m.product_id, m.direction, m.quantity])).toEqual([[1, "IN", 3], [2, "OUT", 5], [1, "IN", 10]]);
        expect(body[0]).toMatchObject({ product_name: "Watalappan", balance_after: 113, movement_type: "production" });
    });

    it.each([
        ["product_id=1", 2],
        ["direction=out", 1],
        ["from=2026-10-13&to=2026-10-13", 2],
        ["from=2026-09-01&to=2026-10-12", 1],
        ["limit=1", 1],
    ])("filters by %s", async (filter, count) => {
        await seedMovements();
        expect((await get(movementsGet, `/api/stock/movements?${filter}`)).body).toHaveLength(count);
    });

    it("reports the real time each movement was entered, not one shifted by the database's time zone", async () => {
        await post(POST, "/api/stock", { product_id: 1, quantity: 1 });
        const { body } = await get(movementsGet, "/api/stock/movements");
        // Date is frozen in these tests; performance gives the real clock that the database's NOW() follows
        const realNow = performance.timeOrigin + performance.now();
        expect(Math.abs(Date.parse(body[0].created_at) - realNow)).toBeLessThan(2 * 60 * 1000);
    });

    it.each(["product_id=abc", "direction=UP", "from=13-10-2026", "limit=0", "limit=501"])("rejects %s with 400", async (filter) => {
        expect((await get(movementsGet, `/api/stock/movements?${filter}`)).status).toBe(400);
    });
});
