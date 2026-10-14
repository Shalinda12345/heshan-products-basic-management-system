import { monthRange, mondayOf, ymd } from "../helpers/test-db";
import { expensesTotal, salesTotal, uniqueCustomers } from "./data";
import { expect, money, test, type Page } from "./fixtures";

// Values from the "Period Financial Summary" card (not animated, unlike the KPI tiles)
const summaryValue = (page: Page, label: string) =>
    page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p[1]");

async function expectSummary(page: Page, range: [string, string]) {
    const [sales, expenses, customers] = await Promise.all([salesTotal(range), expensesTotal(range), uniqueCustomers(range)]);
    await expect(summaryValue(page, "Gross Revenue")).toHaveText(`LKR ${money(sales)}`);
    await expect(summaryValue(page, "Total Expenses")).toHaveText(`LKR ${money(expenses)}`);
    await expect(summaryValue(page, "Net Profit")).toHaveText(`LKR ${money(sales - expenses)}`);
    await expect(summaryValue(page, "Unique Customers")).toHaveText(String(customers));
}

const now = new Date();
const thisMonth = monthRange(now.getFullYear(), now.getMonth() + 1);

test.describe("dashboard", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
    });

    test("opens on this month's figures", async ({ page }) => {
        await expect(page.getByRole("button", { name: "This Month" })).toBeVisible();
        await expectSummary(page, thisMonth);
    });

    test("switches between Today, This Week, This Year and Multi-Year", async ({ page }) => {
        const today = ymd(now);
        await page.getByRole("button", { name: "This Week", exact: true }).click();
        await expectSummary(page, [ymd(mondayOf(now)), today]);
        await page.getByRole("button", { name: "Today", exact: true }).click();
        await expectSummary(page, [today, today]);
        await page.getByRole("button", { name: "This Year", exact: true }).click();
        await expectSummary(page, [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`]);
        await page.getByRole("button", { name: "Multi-Year", exact: true }).click();
        await expectSummary(page, [`${now.getFullYear() - 1}-01-01`, `${now.getFullYear()}-12-31`]);
        await page.getByRole("button", { name: "+", exact: true }).click();
        await expectSummary(page, [`${now.getFullYear() - 2}-01-01`, `${now.getFullYear()}-12-31`]);
    });

    test("month selector moves to another month and back", async ({ page }) => {
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await page.getByTitle("Previous Month").click();
        await expectSummary(page, monthRange(previous.getFullYear(), previous.getMonth() + 1));
        await expect(page.getByText(/Highest-value customers — /)).toContainText(previous.toLocaleString("en-US", { month: "long" }));
        await page.getByTitle("Reset to current month").click();
        await expectSummary(page, thisMonth);
    });

    test("KPI tiles count up to the period totals", async ({ page }) => {
        const sales = await salesTotal(thisMonth);
        // Tile title <p> sits in a header row; the value is the next <p> after that row
        const tile = page.locator("p", { hasText: /^Total Revenue$/ }).locator("xpath=../following-sibling::p[1]");
        const short = sales >= 1000 ? `LKR ${(sales / 1000).toFixed(1)}K` : `LKR ${sales.toFixed(2)}`;
        await expect(tile).toHaveText(short);
    });

    test("draws the bar, line and donut charts", async ({ page }) => {
        await expect.poll(() => page.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
        await expect.poll(() => page.locator(".recharts-pie-sector").count()).toBeGreaterThan(0);
        await expect(page.locator(".recharts-line-curve")).toHaveCount(3);
        await expect(page.locator(".recharts-area-area")).toHaveCount(3);
    });

    test("lists top customers for the period", async ({ page }) => {
        const card = page.getByRole("heading", { name: "Top Customers by Revenue" }).locator("xpath=../..");
        await expect(card.locator("tbody tr")).toHaveCount(await uniqueCustomers(thisMonth));
    });
});
