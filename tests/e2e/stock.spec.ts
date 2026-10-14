import { query, stockOf } from "../helpers/test-db";
import { expect, expectAlert, field, selectOptionContaining, test, type Page } from "./fixtures";

const levels = (page: Page) => page.getByRole("table", { name: "Stock levels" });
const ledger = (page: Page) => page.getByRole("table", { name: "Stock movements" });
const row = (page: Page, product: string) => levels(page).locator("tbody tr").filter({ hasText: product });
const form = (page: Page) => page.getByRole("form", { name: "Stock movement form" });

test.describe("stock control", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/pages/stock");
        await expect(levels(page).locator("tbody tr.animate-pulse")).toHaveCount(0);
    });

    test("shows each product's level with an in/low/out-of-stock badge", async ({ page }) => {
        await expect(levels(page).locator("tbody tr")).toHaveCount(6);
        await expect(row(page, "Watalappan")).toContainText("In Stock (100)");
        await expect(row(page, "Curd Pot")).toContainText("Low Stock (5)");
        await expect(row(page, "Milk Toffee")).toContainText("Out of Stock (0)");
        await expect(row(page, "Pudding Cup")).toContainText("Out of Stock (0)");
    });

    test("summarises stock in the KPI tiles", async ({ page }) => {
        const kpis = page.getByTestId("stock-kpis");
        await expect(kpis).toContainText("Products6");
        await expect(kpis).toContainText("Units on Hand175");
        await expect(kpis).toContainText("Low Stock1");
        await expect(kpis).toContainText("Out of Stock2");
    });

    test("records a stock inflow and logs it in the ledger", async ({ page }) => {
        await selectOptionContaining(field(form(page), "Product"), "Curd Pot");
        await field(form(page), "Quantity").fill("10");
        await field(form(page), "Note (optional)").fill("Morning batch");
        await page.getByRole("button", { name: "Add Stock" }).click();
        await expectAlert(page, "Stock Added", 'Successfully added 10 units of "Curd Pot". New balance: 15.');
        await expect(row(page, "Curd Pot")).toContainText("In Stock (15)");
        await expect(row(page, "Curd Pot")).toContainText("+10");
        const entry = ledger(page).locator("tbody tr").first();
        await expect(entry).toContainText("Curd Pot");
        await expect(entry).toContainText("Production / Received");
        await expect(entry).toContainText("Morning batch");
        await expect(entry).toContainText("+10");
        expect(await stockOf(3)).toBe(15);
    });

    test("records the first inflow for a product with no stock yet", async ({ page }) => {
        await selectOptionContaining(field(form(page), "Product"), "Pudding Cup");
        await field(form(page), "Quantity").fill("4");
        await page.getByRole("button", { name: "Add Stock" }).click();
        await expectAlert(page, "Stock Added");
        await expect(row(page, "Pudding Cup")).toContainText("Low Stock (4)");
        expect(await stockOf(5)).toBe(4);
    });

    test("records a stock outflow with its reason", async ({ page }) => {
        await page.getByRole("button", { name: "▼ Stock Out" }).click();
        await selectOptionContaining(field(form(page), "Product"), "Yogurt");
        await field(form(page), "Quantity").fill("6");
        await field(form(page), "Reason").selectOption({ label: "Damaged / Expired" });
        await page.getByRole("button", { name: "Remove Stock" }).click();
        await expectAlert(page, "Stock Removed", 'Removed 6 units of "Yogurt" (Damaged / Expired). New balance: 44.');
        await expect(row(page, "Yogurt")).toContainText("In Stock (44)");
        await expect(row(page, "Yogurt")).toContainText("−6");
        await expect(ledger(page).locator("tbody tr").first()).toContainText("Damaged / Expired");
        expect(await stockOf(2)).toBe(44);
    });

    test("blocks a stock outflow larger than the stock", async ({ page }) => {
        await page.getByRole("button", { name: "▼ Stock Out" }).click();
        await selectOptionContaining(field(form(page), "Product"), "Curd Pot");
        await expect(form(page)).toContainText("Current 5");
        await field(form(page), "Quantity").fill("9");
        await expect(form(page)).toContainText("Exceeds stock");
        expect(await stockOf(3)).toBe(5);
    });

    test("only offers the submit button once a product is chosen", async ({ page }) => {
        await expect(page.getByRole("button", { name: "Add Stock" })).toHaveCount(0);
        await expect(page.getByText("Select a product and quantity to submit.")).toBeVisible();
    });

    test("filters the table by name or description", async ({ page }) => {
        await page.getByPlaceholder("Search products...").fill("vanilla");
        await expect(levels(page).locator("tbody tr")).toHaveCount(1);
        await expect(levels(page).locator("tbody tr")).toContainText("Ice Cream Tub");
        await page.getByPlaceholder("Search products...").fill("zzz");
        await expect(page.getByText("No products match your search query.")).toBeVisible();
    });

    test("shows movements made elsewhere without reloading", async ({ page }) => {
        await expect(ledger(page)).toContainText("No stock movements");
        // Another user sells 3 Watalappan
        const status = await page.evaluate(async () => {
            const res = await fetch("/api/sales/save-sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_name: "Kamal Stores",
                    sale_date: new Date().toLocaleDateString("en-CA"),
                    items: [{ product_name: "Watalappan", quantity: 3, selling_price: 150 }],
                }),
            });
            return res.status;
        });
        expect(status).toBe(201);
        await expect(row(page, "Watalappan")).toContainText("In Stock (97)", { timeout: 10_000 });
        const entry = ledger(page).locator("tbody tr").first();
        await expect(entry).toContainText("Sale");
        await expect(entry).toContainText("Sale #7");
        await expect(entry).toContainText("−3");
    });

    test("filters the ledger by product and direction", async ({ page }) => {
        await query("INSERT INTO stock_movements (product_id, product_name, direction, movement_type, quantity, balance_after, movement_date) VALUES (1,'Watalappan','IN','production',5,105,CURDATE()), (2,'Yogurt','OUT','damaged',2,48,CURDATE())");
        await page.reload();
        await expect(ledger(page).locator("tbody tr")).toHaveCount(2);
        await page.getByLabel("Filter by direction").selectOption("OUT");
        await expect(ledger(page).locator("tbody tr")).toHaveCount(1);
        await expect(ledger(page)).toContainText("Yogurt");
        await page.getByRole("button", { name: "Clear" }).click();
        await row(page, "Watalappan").click();
        await expect(ledger(page).locator("tbody tr")).toHaveCount(1);
        await expect(ledger(page)).toContainText("Watalappan");
    });
});
