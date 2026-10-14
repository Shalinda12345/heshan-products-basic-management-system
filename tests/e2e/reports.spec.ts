import { query } from "../helpers/test-db";
import { expect, test } from "./fixtures";

test.describe("reports", () => {
    test("profit & loss compares the month with the one before and explains it in words", async ({ page }) => {
        await page.goto("/reports");
        await expect(page.getByRole("heading", { name: "Profit & loss" })).toBeVisible();
        await expect(page.getByText("Revenue", { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("region", { name: "In short" })).toContainText(/net profit|loss/);
        await expect(page.getByRole("table", { name: "Monthly profit and loss" }).locator("tbody tr")).toHaveCount(12);
    });

    test("keeps the chosen period when moving between reports", async ({ page }) => {
        await page.goto("/reports");
        await page.getByLabel("Period", { exact: true }).selectOption("last_12_months");
        await expect(page).toHaveURL(/preset=last_12_months/);
        await page.getByRole("navigation", { name: "Report sections" }).getByRole("link", { name: "Products" }).click();
        await expect(page).toHaveURL(/\/reports\/products\?preset=last_12_months$/);
        await expect(page.getByLabel("Period", { exact: true })).toHaveValue("last_12_months");
        await expect(page.getByRole("table", { name: "Product performance" })).toContainText("Watalappan");
    });

    test("stock health lists what to reorder first", async ({ page }) => {
        await query("UPDATE products SET reorder_level = 200 WHERE product_name = 'Watalappan'");
        await page.goto("/reports/stock");
        await expect(page.getByRole("status").filter({ hasText: "Reorder or produce soon" })).toContainText("Watalappan");
        const first = page.getByRole("table", { name: "Stock health" }).locator("tbody tr").first();
        await expect(first).toContainText("Out of stock");
    });
});
