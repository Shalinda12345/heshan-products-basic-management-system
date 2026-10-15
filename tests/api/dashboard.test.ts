import { describe, expect, it } from "vitest";
import { GET as dashboard } from "@/app/api/dashboard/summary/route";
import { get } from "../helpers/http";
import { query } from "../helpers/test-db";

// Clock frozen on Tue 2026-10-13.
// Sales:    #1 1900 (10-12 Kamal) #2 2400 (10-01 Nimal) #3 2700 (09-15 Sunil) #4 560 (2025-12-20 Kamal) #5 80 (10-31 Nimal) #6 170 (11-01 Sunil)
// Expenses: 5000 Electricity (10-12) 1200 Transport (10-01) 2500 Sugar (09-15) 300 Transport (10-31) 4000 Electricity (11-01)
const summary = async (search: string) => {
    const { status, body } = await get(dashboard, `/api/dashboard/summary?${search}`);
    expect(status).toBe(200);
    return body;
};
const bucket = (body: { chartData: { label: string }[] }, label: string) => body.chartData.find((p) => p.label === label);

describe("GET /api/dashboard/summary", () => {
    it("This Month: KPIs, daily buckets and month boundaries", async () => {
        const body = await summary("period=month&years=1&year=2026&month=10");
        expect(body.kpis).toEqual({ totalSales: 4380, totalExpenses: 6500, netProfit: -2120, profitMargin: -48.4 });
        expect(body.chartData).toHaveLength(31);
        expect(bucket(body, "1")).toEqual({ label: "1", sales: 2400, expenses: 1200, profit: 1200 });
        expect(bucket(body, "12")).toEqual({ label: "12", sales: 1900, expenses: 5000, profit: -3100 });
        expect(bucket(body, "31")).toEqual({ label: "31", sales: 80, expenses: 300, profit: -220 });
    });

    it("defaults to the current month", async () => {
        expect((await summary("")).kpis.totalSales).toBe(4380);
    });

    it("month selector: a previous month", async () => {
        const body = await summary("period=month&years=1&year=2026&month=9");
        expect(body.kpis).toMatchObject({ totalSales: 2700, totalExpenses: 2500 });
        expect(body.chartData).toHaveLength(30);
    });

    it("Today: one bucket for today", async () => {
        const body = await summary("period=day&years=1");
        expect(body.chartData).toEqual([{ label: "13 Oct", sales: 0, expenses: 0, profit: 0 }]);
        expect(body.kpis.profitMargin).toBe(0);
    });

    it("This Week: Monday up to today", async () => {
        const body = await summary("period=week&years=1");
        expect(body.chartData.map((p: { label: string }) => p.label)).toEqual(["12 Oct", "13 Oct"]);
        expect(body.kpis).toMatchObject({ totalSales: 1900, totalExpenses: 5000 });
    });

    it("This Year: twelve monthly buckets", async () => {
        const body = await summary("period=year&years=1");
        expect(body.chartData).toHaveLength(12);
        expect(body.kpis).toMatchObject({ totalSales: 7250, totalExpenses: 13000 });
        expect(bucket(body, "Oct")).toMatchObject({ sales: 4380, expenses: 6500 });
        expect(bucket(body, "Nov")).toMatchObject({ sales: 170, expenses: 4000 });
    });

    it("Multi-Year: one bucket per month across the years", async () => {
        const two = await summary("period=multi&years=2");
        expect(two.chartData).toHaveLength(24);
        expect(two.kpis.totalSales).toBe(7810);
        expect(bucket(two, "Dec 2025")).toMatchObject({ sales: 560 });
        expect((await summary("period=multi&years=5")).chartData).toHaveLength(60);
    });

    it("Multi-Year: clamps the number of years to 2..10", async () => {
        expect((await summary("period=multi&years=1")).chartData).toHaveLength(24);
        expect((await summary("period=multi&years=50")).chartData).toHaveLength(120);
    });

    it("expense breakdown by category, largest first", async () => {
        const body = await summary("period=month&year=2026&month=10");
        expect(body.expenseBreakdown).toEqual([{ name: "Electricity", value: 5000 }, { name: "Transport", value: 1500 }]);
    });

    it("top customers by revenue", async () => {
        const body = await summary("period=month&year=2026&month=10");
        expect(body.topCustomers).toEqual([{ name: "Nimal Bakery", total: 2480 }, { name: "Kamal Stores", total: 1900 }]);
        expect(body.uniqueCustomers).toBe(2);
    });

    it("counts every unique customer even though the top list stops at 10", async () => {
        const values = Array.from({ length: 12 }, (_, i) => `('Shop ${i + 1}', ${100 + i}, '2026-10-05')`).join(",");
        await query(`INSERT INTO sales (customer_name, grand_total, sale_date) VALUES ${values}`);
        const body = await summary("period=month&year=2026&month=10");
        expect(body.topCustomers).toHaveLength(10);
        expect(body.uniqueCustomers).toBe(14);
    });

    it.each(["period=fortnight", "period=multi&years=abc", "period=month&year=2026&month=13"])("refuses %s with 400", async (search) => {
        expect((await get(dashboard, `/api/dashboard/summary?${search}`)).status).toBe(400);
    });

    it("is never cached", async () => {
        const { headers } = await get(dashboard, "/api/dashboard/summary?period=month");
        expect(headers.get("cache-control")).toContain("no-store");
    });
});
