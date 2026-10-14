import { describe, expect, it } from "vitest";
import { GET as itemsSummary } from "@/app/api/sales/get-items-summary/route";
import { get } from "../helpers/http";

// Clock frozen on Tue 2026-10-13. Lines: #1 (10-12) Watalappan 10@150, Yogurt 5@80 | #2 (10-01) Curd Pot 2@1200
// #3 (09-15) Ice Cream Tub 3@900 | #4 (2025-12-20) Watalappan 4@140 | #5 (10-31) Yogurt 1@80 | #6 (11-01) Yogurt 2@85
const summary = (search: string) => get(itemsSummary, `/api/sales/get-items-summary?${search}`);
const units = (items: { product_name: string; quantity: number }[]) => items.map((i) => [i.product_name, i.quantity]);

describe("GET /api/sales/get-items-summary", () => {
    it("daily (default) covers today only", async () => {
        const { status, body } = await summary("");
        expect(status).toBe(200);
        expect(body.timeframe).toBe("daily");
        expect(body.items).toEqual([]);
        expect(body.summary).toEqual({ totalUnitsSold: 0, totalRevenue: 0, totalProducts: 0, topProduct: null });
    });

    it("daily with a date covers that date", async () => {
        const { body } = await summary("timeframe=daily&date=2026-10-12");
        expect(units(body.items)).toEqual([["Watalappan", 10], ["Yogurt", 5]]);
    });

    it("weekly covers Monday to Sunday of the current week", async () => {
        const { body } = await summary("timeframe=weekly");
        expect(body.summary).toMatchObject({ totalUnitsSold: 15, totalRevenue: 1900, totalProducts: 2 });
    });

    it("monthly aggregates per product, ordered by units sold", async () => {
        const { body } = await summary("timeframe=monthly&year=2026&month=10");
        expect(units(body.items)).toEqual([["Watalappan", 10], ["Yogurt", 6], ["Curd Pot", 2]]);
        expect(body.summary).toMatchObject({ totalUnitsSold: 18, totalRevenue: 4380, totalProducts: 3 });
        expect(body.summary.topProduct).toEqual({ product_name: "Watalappan", quantity: 10, revenue: 1500 });
        expect(body.dateRange.label).toBe("October 2026");
    });

    it("reports per-product invoice count, price range and shares", async () => {
        const { body } = await summary("timeframe=monthly&year=2026&month=10");
        const yogurt = body.items.find((i: { product_name: string }) => i.product_name === "Yogurt");
        expect(yogurt).toMatchObject({ quantity: 6, revenue: 480, orders_count: 2, avg_price: 80, min_price: 80, max_price: 80 });
        const unitShare = body.items.reduce((sum: number, i: { percentage_of_units: number }) => sum + i.percentage_of_units, 0);
        expect(unitShare).toBeCloseTo(100, 0);
    });

    it("custom with a date range uses the range (inclusive)", async () => {
        const { body } = await summary("timeframe=custom&year=2026&month=10&startDate=2026-09-01&endDate=2026-10-12");
        expect(body.summary).toMatchObject({ totalUnitsSold: 20, totalRevenue: 7000, totalProducts: 4 });
    });

    it("custom without a range falls back to the given month", async () => {
        const { body } = await summary("timeframe=custom&year=2026&month=9");
        expect(units(body.items)).toEqual([["Ice Cream Tub", 3]]);
    });

    it("excludes sales just outside the month", async () => {
        const { body } = await summary("timeframe=monthly&year=2026&month=11");
        expect(units(body.items)).toEqual([["Yogurt", 2]]);
    });
});
