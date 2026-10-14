import { monthRange, weekRange, ymd } from "../helpers/test-db";
import { addSale, saleIds, salesTotal, unitsSold } from "./data";
import { expect, money, test, type Page } from "./fixtures";

const now = new Date();
const today = ymd(now);
const invoiceRows = (page: Page) => page.locator("tbody tr.cursor-pointer");
const unitsTile = (page: Page) => page.locator("span", { hasText: /^Total Units Sold$/ }).locator("xpath=../following-sibling::p[1]");

async function expectInvoices(page: Page, range: [string, string], prefix: string) {
    const ids = await saleIds(range);
    await expect(invoiceRows(page)).toHaveCount(ids.length);
    for (const id of ids) await expect(invoiceRows(page).filter({ hasText: `${prefix}${id}` })).toHaveCount(1);
    await expect(page.getByText(`Rs.${money(await salesTotal(range))}`).first()).toBeVisible();
}

test.describe("sales reports", () => {
    test.beforeEach(async () => {
        // Make sure "today" has an invoice for the daily report
        await addSale(today, "Sunil Mart", [["Watalappan", 3, 150], ["Yogurt", 2, 80]]);
    });

    test("daily report lists today's invoices and their lines", async ({ page }) => {
        await page.goto("/pages/sales/daily-sales");
        await expectInvoices(page, [today, today], "#SAL-");
        const [id] = await saleIds([today, today]);
        await invoiceRows(page).filter({ hasText: `#SAL-${id}` }).click();
        const breakdown = page.locator("table table, td table").filter({ hasText: "Item Name" });
        await expect(breakdown.locator(":scope > tbody > tr")).toHaveCount(2);
        await expect(breakdown).toContainText("Watalappan");
    });

    test("daily report finds an invoice by its displayed ID or customer", async ({ page }) => {
        await page.goto("/pages/sales/daily-sales");
        const [id] = await saleIds([today, today]);
        const search = page.getByPlaceholder("Search by customer name or ID...");
        await search.fill(`#SAL-${id}`);
        await expect(invoiceRows(page)).toHaveCount(1);
        await search.fill("sunil");
        await expect(invoiceRows(page)).toHaveCount(1);
        await search.fill("nobody");
        await expect(invoiceRows(page)).toHaveCount(0);
    });

    test("weekly report lists Monday to Sunday", async ({ page }) => {
        await page.goto("/pages/sales/weekly-sales");
        await expectInvoices(page, weekRange(now), "#W-SAL-");
    });

    test("monthly report lists the current month", async ({ page }) => {
        await page.goto("/pages/sales/monthly-sales");
        await expectInvoices(page, monthRange(now.getFullYear(), now.getMonth() + 1), "#M-SAL-");
    });

    test("custom report moves between months", async ({ page }) => {
        await page.goto("/pages/sales/custom-sales");
        await expectInvoices(page, monthRange(now.getFullYear(), now.getMonth() + 1), "#C-SAL-");
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await page.getByTitle("Previous Month").click();
        await expectInvoices(page, monthRange(previous.getFullYear(), previous.getMonth() + 1), "#C-SAL-");
    });

    test("each report's Items Sold tab totals the units for its period", async ({ page }) => {
        const cases: [string, [string, string]][] = [
            ["/pages/sales/daily-sales", [today, today]],
            ["/pages/sales/weekly-sales", weekRange(now)],
            ["/pages/sales/monthly-sales", monthRange(now.getFullYear(), now.getMonth() + 1)],
        ];
        for (const [path, range] of cases) {
            await page.goto(path);
            await page.getByRole("button", { name: "Items Sold Breakdown" }).click();
            await expect(unitsTile(page)).toHaveText(String(await unitsSold(range)));
        }
    });
});
