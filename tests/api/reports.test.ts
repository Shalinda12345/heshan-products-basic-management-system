import { describe, expect, it } from "vitest";
import { GET as overview } from "@/app/api/reports/overview/route";
import { GET as productsReport } from "@/app/api/reports/products/route";
import { GET as customersReport } from "@/app/api/reports/customers/route";
import { GET as expensesReport } from "@/app/api/reports/expenses/route";
import { GET as stockReport } from "@/app/api/reports/stock/route";
import { GET as dashboard } from "@/app/api/dashboard/summary/route";
import { POST as voidSale } from "@/app/api/sales/[id]/void/route";
import { POST as saveExpense } from "@/app/api/expenses/save-expenses/route";
import { POST as saveReturn } from "@/app/api/expenses/save-return-expenses/route";
import { get, post } from "../helpers/http";
import { query } from "../helpers/test-db";

// Clock frozen on Tue 2026-10-13. October: sales #1 Kamal 1900 (10-12), #2 Nimal 2400 (10-01), #5 Nimal 80 (10-31);
// September: #3 Sunil 2700 (09-15). Expenses October: Electricity 5000, Transport 1200 + 300; September: Sugar 2500.
const OCTOBER = "from=2026-10-01&to=2026-10-31";

describe("GET /api/reports/overview", () => {
    it("gives the period's profit and loss next to the previous month's", async () => {
        const { status, body } = await get(overview, `/api/reports/overview?${OCTOBER}`);
        expect(status).toBe(200);
        expect(body.period).toEqual({ from: "2026-10-01", to: "2026-10-31", label: "Oct 2026" });
        expect(body.previous).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "Sep 2026" });
        expect(body.current).toEqual({
            revenue: 4380, expenses: 6500, profit: -2120, margin: -48.4, invoices: 3, avg_invoice: 1460,
            customers: 2, units_sold: 18, returns_value: 0, returns_count: 0,
        });
        expect(body.prior).toMatchObject({ revenue: 2700, expenses: 2500, profit: 200, margin: 7.4, invoices: 1, customers: 1, units_sold: 3 });
        expect(body.changes).toMatchObject({ revenue: 62.2, expenses: 160, invoices: 200 });
        // A profit turning into a loss has no meaningful percentage change (the page shows the rupee difference)
        expect(body.changes.profit).toBeNull();
    });

    it("shows the 12 months up to the period", async () => {
        const { body } = await get(overview, `/api/reports/overview?${OCTOBER}`);
        expect(body.monthly).toHaveLength(12);
        expect(body.monthly[0]).toEqual({ month: "2025-11", label: "Nov 2025", revenue: 0, expenses: 0, profit: 0 });
        expect(body.monthly[1]).toMatchObject({ month: "2025-12", revenue: 560 });
        expect(body.monthly[10]).toEqual({ month: "2026-09", label: "Sep 2026", revenue: 2700, expenses: 2500, profit: 200 });
        expect(body.monthly[11]).toEqual({ month: "2026-10", label: "Oct 2026", revenue: 4380, expenses: 6500, profit: -2120 });
    });

    it("compares expense categories between the periods", async () => {
        const { body } = await get(overview, `/api/reports/overview?${OCTOBER}`);
        expect(body.expense_categories).toEqual([
            { name: "Electricity", current: 5000, previous: 0, change: null },
            { name: "Transport", current: 1500, previous: 0, change: null },
            { name: "Sugar", current: 0, previous: 2500, change: -100 },
        ]);
    });

    it("leaves voided invoices out and counts returns", async () => {
        await post(voidSale, "/api/sales/2/void", { reason: "Cancelled" }, { params: { id: "2" } });
        await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "sale_reduction_return", sale_id: 1, sale_product_name: "Yogurt", sale_quantity: 1, sale_per_unit_amount: 80, product_id: 2, expense_date: "2026-10-13",
        });
        const { body } = await get(overview, `/api/reports/overview?${OCTOBER}`);
        expect(body.current).toMatchObject({ revenue: 1900, invoices: 2, units_sold: 15, returns_value: 80, returns_count: 1 });
    });

    it("leaves out returns on an invoice that was voided afterwards", async () => {
        await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "sale_reduction_expense_return", sale_id: 2, sale_product_name: "Curd Pot", sale_quantity: 1, sale_per_unit_amount: 1200, expense_per_unit_amount: 500, expense_date: "2026-10-13",
        });
        await post(voidSale, "/api/sales/2/void", { reason: "Cancelled" }, { params: { id: "2" } });
        const { body } = await get(overview, `/api/reports/overview?${OCTOBER}`);
        expect(body.current).toMatchObject({ returns_value: 0, returns_count: 0 });
    });

    it("compares a custom range with the same number of days before it", async () => {
        const { body } = await get(overview, "/api/reports/overview?from=2026-10-10&to=2026-10-13");
        expect(body.previous).toMatchObject({ from: "2026-10-06", to: "2026-10-09" });
    });

    it.each(["", "from=2026-10-01", "from=2026-10-31&to=2026-10-01", "from=2000-01-01&to=2026-01-01", "from=oct&to=nov"])("rejects %j", async (query) => {
        expect((await get(overview, `/api/reports/overview?${query}`)).status).toBe(400);
    });

    it.each([["owner", 200], ["manager", 200], ["staff", 403]] as const)("is open to a %s: %d", async (as, status) => {
        expect((await get(overview, `/api/reports/overview?${OCTOBER}`, { as })).status).toBe(status);
    });
});

describe("GET /api/reports/products", () => {
    it("ranks products by revenue with their change and estimated margin", async () => {
        await query("UPDATE products SET unit_cost = 90 WHERE product_id = 1");
        const { status, body } = await get(productsReport, `/api/reports/products?${OCTOBER}`);
        expect(status).toBe(200);
        expect(body.rows.map((r: { product_name: string; units: number; revenue: number }) => [r.product_name, r.units, r.revenue])).toEqual([
            ["Curd Pot", 2, 2400], ["Watalappan", 10, 1500], ["Yogurt", 6, 480], ["Ice Cream Tub", 0, 0], ["Milk Toffee", 0, 0], ["Pudding Cup", 0, 0],
        ]);
        expect(body.rows[1]).toMatchObject({
            product_id: 1, invoices: 1, avg_price: 150, share: 34.2, unit_cost: 90, est_cost: 900, est_profit: 600, est_margin: 40, on_hand: 100,
        });
        expect(body.rows[3]).toMatchObject({ prev_units: 3, prev_revenue: 2700, change: -100 });
        expect(body.totals).toEqual({ units: 18, revenue: 4380, prev_revenue: 2700, est_profit: 600, cost_coverage: 34.2, not_selling: 3 });
    });
});

describe("GET /api/reports/customers", () => {
    it("ranks customers and spots new and lapsed ones", async () => {
        const { status, body } = await get(customersReport, `/api/reports/customers?${OCTOBER}`);
        expect(status).toBe(200);
        expect(body.rows.map((r: { customer_name: string; revenue: number; invoices: number }) => [r.customer_name, r.revenue, r.invoices])).toEqual([
            ["Nimal Bakery", 2480, 2], ["Kamal Stores", 1900, 1], ["Sunil Mart", 0, 0],
        ]);
        expect(body.rows[0]).toMatchObject({ avg_invoice: 1240, share: 56.6, is_new: true, first_purchase: "2026-10-01" });
        expect(body.rows[1]).toMatchObject({ last_purchase: "2026-10-12", days_since_last_purchase: 1, is_new: false });
        expect(body.rows[2]).toMatchObject({ prev_revenue: 2700, change: -100 });
        expect(body.totals).toEqual({
            revenue: 4380, prev_revenue: 2700, customers_buying: 2, prev_customers_buying: 1, new_customers: 1, lapsed_customers: 1, top5_share: 100,
            top_customer: { name: "Nimal Bakery", share: 56.6 },
        });
    });
});

describe("GET /api/reports/expenses", () => {
    it("breaks expenses down by category and employee, grouping return write-offs", async () => {
        await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Salary", employee_name: "Ruwan Perera", per_expense_amount: 40000, expense_date: "2026-10-05" });
        await post(saveExpense, "/api/expenses/save-expenses", { expense_name: "Salary Advance", employee_name: "Ruwan Perera", per_expense_amount: 5000, expense_date: "2026-10-06" });
        await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 2, per_unit_amount: 80, expense_date: "2026-10-07",
        });

        const { status, body } = await get(expensesReport, `/api/reports/expenses?${OCTOBER}`);
        expect(status).toBe(200);
        expect(body.categories.map((c: { name: string; total: number; count: number }) => [c.name, c.total, c.count])).toEqual([
            ["Salary", 40000, 1], ["Electricity", 5000, 1], ["Salary Advance", 5000, 1], ["Transport", 1500, 2], ["Returns & write-offs", 160, 1], ["Sugar", 0, 0],
        ]);
        expect(body.employees).toEqual([{ employee_name: "Ruwan Perera", total: 45000, by_category: { Salary: 40000, "Salary Advance": 5000 } }]);
        expect(body.totals).toEqual({ total: 51660, prev_total: 2500, change: 1966.4 });
        expect(body.monthly.at(-1)).toEqual({ month: "2026-10", label: "Oct 2026", total: 51660 });
    });

    it("shows return write-offs as one category on the dashboard too", async () => {
        await post(saveReturn, "/api/expenses/save-return-expenses", {
            return_type: "stock_expense_return", product_id: 2, product_name: "Yogurt", quantity: 2, per_unit_amount: 80, expense_date: "2026-10-07",
        });
        const { body } = await get(dashboard, "/api/dashboard/summary?period=month");
        expect(body.expenseBreakdown).toContainEqual({ name: "Returns & write-offs", value: 160 });
    });
});

describe("GET /api/reports/stock", () => {
    it("shows what needs reordering first, with stock value and days of cover", async () => {
        await query("UPDATE products SET unit_cost = 90, unit_price = 150 WHERE product_id = 1");
        await query("INSERT INTO stocks (product_id, quantity) VALUES (5, 4)");
        const { status, body } = await get(stockReport, "/api/reports/stock");
        expect(status).toBe(200);
        expect(body.window).toEqual({ from: "2026-09-14", to: "2026-10-13" });
        expect(body.rows.map((r: { product_name: string; status: string }) => [r.product_name, r.status])).toEqual([
            ["Milk Toffee", "out"], ["Curd Pot", "low"], ["Pudding Cup", "low"], ["Ice Cream Tub", "ok"], ["Watalappan", "ok"], ["Yogurt", "ok"],
        ]);
        expect(body.rows.find((r: { product_id: number }) => r.product_id === 1)).toMatchObject({
            on_hand: 100, stock_value: 9000, retail_value: 15000, sold_30d: 10, avg_daily: 0.33, days_of_cover: 300, last_sale: "2026-10-12", slow_moving: false,
        });
        expect(body.rows.find((r: { product_id: number }) => r.product_id === 5)).toMatchObject({ sold_30d: 0, days_of_cover: null, slow_moving: true });
        expect(body.totals).toEqual({ stock_value: 9000, retail_value: 15000, products_out: 1, products_low: 2, slow_moving: 1, missing_cost: 4 });
    });

    it("uses each product's own reorder level", async () => {
        await query("UPDATE products SET reorder_level = 120 WHERE product_id = 1");
        const { body } = await get(stockReport, "/api/reports/stock");
        expect(body.rows.find((r: { product_id: number }) => r.product_id === 1)).toMatchObject({ status: "low", reorder_level: 120 });
    });
});
