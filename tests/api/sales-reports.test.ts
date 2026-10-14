import { describe, expect, it } from "vitest";
import { GET as dailySales } from "@/app/api/sales/get-daily-sales/route";
import { GET as monthlySales } from "@/app/api/sales/get-monthly-sales/route";
import { GET as saleItems } from "@/app/api/sales/get-sale-items/route";
import { GET as salesList } from "@/app/api/sales/get-sales-list/route";
import { GET as weeklySales } from "@/app/api/sales/get-weekly-sales/route";
import { POST as saveSale } from "@/app/api/sales/save-sales/route";
import { get, post } from "../helpers/http";

// Clock frozen on Tue 2026-10-13. Seeded sales: #1 Mon 10-12, #2 10-01, #3 09-15, #4 2025-12-20, #5 10-31, #6 11-01
const ids = (rows: { sale_id: number }[]) => rows.map((r) => r.sale_id);

describe("GET /api/sales/get-daily-sales", () => {
    it("returns only today's sales", async () => {
        expect((await get(dailySales, "/api/sales/get-daily-sales")).body).toEqual([]);
        await post(saveSale, "/api/sales/save-sales", {
            customer_name: "Sunil Mart", sale_date: "2026-10-13", items: [{ product_name: "Yogurt", quantity: 1, selling_price: 80 }],
        });
        const { status, body } = await get(dailySales, "/api/sales/get-daily-sales");
        expect(status).toBe(200);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ customer_name: "Sunil Mart", grand_total: 80 });
    });

    it("serialises sale_date as an ISO string for the browser", async () => {
        const { body } = await get(monthlySales, "/api/sales/get-monthly-sales");
        expect(body[0].sale_date).toBe("2026-10-31T00:00:00.000Z");
    });
});

describe("GET /api/sales/get-weekly-sales", () => {
    it("returns Monday-to-Sunday of the current week", async () => {
        expect(ids((await get(weeklySales, "/api/sales/get-weekly-sales")).body)).toEqual([1]);
    });

    it("returns a whole month when year and month are given", async () => {
        expect(ids((await get(weeklySales, "/api/sales/get-weekly-sales?year=2026&month=9")).body)).toEqual([3]);
    });
});

describe("GET /api/sales/get-monthly-sales", () => {
    it("returns the current month, newest first, excluding neighbouring months", async () => {
        expect(ids((await get(monthlySales, "/api/sales/get-monthly-sales")).body)).toEqual([5, 1, 2]);
    });

    it.each([
        ["2026", "9", [3]],
        ["2025", "12", [4]],
        ["2026", "11", [6]],
        ["2026", "2", []],
    ])("returns %s-%s for the custom report", async (year, month, expected) => {
        expect(ids((await get(monthlySales, `/api/sales/get-monthly-sales?year=${year}&month=${month}`)).body)).toEqual(expected);
    });
});

describe("GET /api/sales/get-sale-items", () => {
    it("returns the lines of one invoice", async () => {
        const { status, body } = await get(saleItems, "/api/sales/get-sale-items?sale_id=1");
        expect(status).toBe(200);
        expect(body.map((i: { product_name: string; quantity: number }) => [i.product_name, i.quantity])).toEqual([["Watalappan", 10], ["Yogurt", 5]]);
    });

    it("returns an empty list for an unknown invoice", async () => {
        expect((await get(saleItems, "/api/sales/get-sale-items?sale_id=4242")).body).toEqual([]);
    });

    it.each(["", "?sale_id=", "?sale_id=abc", "?sale_id=-1", "?sale_id=1.5"])("rejects a missing or invalid sale_id (%s) with 400", async (search) => {
        expect((await get(saleItems, `/api/sales/get-sale-items${search}`)).status).toBe(400);
    });
});

describe("GET /api/sales/get-sales-list (return form sale picker)", () => {
    it("lists every sale, newest id first, with the picker fields only", async () => {
        const { body } = await get(salesList, "/api/sales/get-sales-list");
        expect(ids(body)).toEqual([6, 5, 4, 3, 2, 1]);
        expect(Object.keys(body[0]).sort()).toEqual(["customer_name", "grand_total", "sale_date", "sale_id"]);
    });
});
