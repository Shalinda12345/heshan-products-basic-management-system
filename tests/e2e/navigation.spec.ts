import { expect, test } from "./fixtures";

test.describe("navigation", () => {
    test("navbar links reach every section", async ({ page }) => {
        await page.goto("/");
        const nav = page.locator("nav");
        for (const [name, path] of [["Sales", "/pages/sales"], ["Expenses", "/pages/expenses"], ["Stock", "/pages/stock"], ["Dashboard", "/"]]) {
            await nav.getByRole("link", { name, exact: true }).click();
            await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
        }
    });

    test("sales tabs navigate and highlight the current tab", async ({ page }) => {
        await page.goto("/pages/sales");
        for (const [name, path] of [
            ["Items Sold", "/pages/sales/items-sold"],
            ["Daily Reports", "/pages/sales/daily-sales"],
            ["Weekly Statements", "/pages/sales/weekly-sales"],
            ["Monthly Audits", "/pages/sales/monthly-sales"],
            ["Custom", "/pages/sales/custom-sales"],
            ["New Sale", "/pages/sales"],
        ]) {
            const tab = page.locator(`a[href="${path}"]`).filter({ hasText: name });
            await tab.click();
            await expect(page).toHaveURL(new RegExp(`${path}$`));
            await expect(tab).toHaveClass(/bg-blue-600/);
        }
    });

    test("expense tabs navigate and highlight the current tab", async ({ page }) => {
        await page.goto("/pages/expenses");
        for (const [name, path] of [
            ["Weekly Statements", "/pages/expenses/weekly-expenses"],
            ["Monthly Audits", "/pages/expenses/monthly-expenses"],
            ["Custom", "/pages/expenses/custom-expenses"],
            ["New Expense", "/pages/expenses"],
        ]) {
            const tab = page.locator(`a[href="${path}"]`).filter({ hasText: name });
            await tab.click();
            await expect(page).toHaveURL(new RegExp(`${path}$`));
            await expect(tab).toHaveClass(/bg-rose-600/);
        }
    });

    test("mobile menu opens, navigates and closes", async ({ page }) => {
        await page.setViewportSize({ width: 400, height: 860 });
        await page.goto("/");
        await page.getByRole("button", { name: "Open main menu" }).click();
        const menu = page.locator("#mobile-menu");
        await expect(menu.getByRole("link")).toHaveText(["Dashboard", "Sales", "Expenses", "Stock"]);
        await menu.getByRole("link", { name: "Stock" }).click();
        await expect(page).toHaveURL(/\/pages\/stock$/);
        await expect(menu).toHaveCount(0);
    });

    test("internal components are not reachable as pages", async ({ page }) => {
        for (const path of ["/components/navigation-bar", "/components/ui/custom-alert", "/components/sales/sales-invoice", "/components/sales/items-sold-summary"]) {
            const response = await page.goto(path);
            expect(response?.status()).toBe(404);
        }
    });
});
