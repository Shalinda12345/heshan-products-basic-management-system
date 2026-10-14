import { query, stockOf, ymd } from "../helpers/test-db";
import { expect, expectAlert, field, selectOptionContaining, test, type Page } from "./fixtures";

const popupForm = (page: Page) => page.locator("form").filter({ has: page.getByRole("button", { name: "Add to Invoice" }) });
const invoiceRows = (page: Page) => page.locator("table").filter({ hasText: "Unit Price" }).locator("tbody tr");

async function addLine(page: Page, product: string, quantity: number, price: number) {
    if ((await popupForm(page).count()) === 0) await page.getByRole("button", { name: "Add Invoice Item" }).click();
    const form = popupForm(page);
    await selectOptionContaining(form.locator("select"), product);
    await field(form, "Quantity").fill(String(quantity));
    await field(form, "Unit Price (Rs.)").fill(String(price));
    await form.getByRole("button", { name: "Add to Invoice" }).click();
}

test.describe("new sale (invoice builder)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/pages/sales");
        await expect(page.getByRole("button", { name: "Add Invoice Item" })).toBeEnabled();
        await expect(page.locator("#customer")).toBeVisible();
    });

    test("builds an invoice, posts it and deducts stock", async ({ page }) => {
        await page.getByRole("button", { name: "Add Invoice Item" }).click();
        const form = popupForm(page);
        await selectOptionContaining(form.locator("select"), "Watalappan");
        await field(form, "Quantity").fill("3");
        await field(form, "Unit Price (Rs.)").fill("150");
        await expect(form).toContainText("Rs. 450.00");
        await form.getByRole("button", { name: "Add to Invoice" }).click();
        await expect(popupForm(page)).toHaveCount(0);

        await addLine(page, "Yogurt", 2, 80);
        await expect(invoiceRows(page)).toHaveCount(2);
        await expect(page.getByText("Rs. 610.00")).toBeVisible();

        const today = ymd(new Date());
        await page.locator("input[type=date]").fill(today);
        await page.locator("#customer").selectOption("Sunil Mart");
        await page.getByRole("button", { name: /Post Invoice/ }).click();
        await expectAlert(page, "Success", "Invoice successfully saved");

        const [sale] = await query("SELECT customer_name, grand_total, sale_date FROM sales ORDER BY sale_id DESC LIMIT 1");
        expect(sale).toEqual({ customer_name: "Sunil Mart", grand_total: 610, sale_date: today });
        expect(await stockOf(1)).toBe(97);
        expect(await stockOf(2)).toBe(48);
        await expect(invoiceRows(page)).toHaveText([/Invoice is empty/]);
        await expect(page.locator("#customer")).toHaveValue("");
    });

    test("warns when the same product is added twice", async ({ page }) => {
        await addLine(page, "Watalappan", 1, 150);
        await addLine(page, "Watalappan", 2, 150);
        await expectAlert(page, "Duplicate Item", '"Watalappan" is already in the invoice');
        await expect(invoiceRows(page)).toHaveCount(1);
    });

    test("warns when the quantity is above the stock on hand", async ({ page }) => {
        await addLine(page, "Curd Pot", 6, 1200);
        await expectAlert(page, "Insufficient Stock", 'Only 5 units of "Curd Pot" are available in stock.');
    });

    test("removes a line from the invoice", async ({ page }) => {
        await addLine(page, "Watalappan", 1, 150);
        await addLine(page, "Ice Cream Tub", 1, 900);
        await invoiceRows(page).filter({ hasText: "Ice Cream Tub" }).getByRole("button", { name: "Remove" }).click();
        await expect(invoiceRows(page)).toHaveCount(1);
        await expect(invoiceRows(page)).toContainText("Watalappan");
    });

    test("requires a customer and a date before posting", async ({ page }) => {
        await addLine(page, "Yogurt", 1, 80);
        await page.getByRole("button", { name: /Post Invoice/ }).click();
        await expectAlert(page, "Missing Customer");
        await page.locator("#customer").selectOption("Kamal Stores");
        await page.getByRole("button", { name: /Post Invoice/ }).click();
        await expectAlert(page, "Missing Date");
        expect((await query("SELECT COUNT(*) AS n FROM sales"))[0].n).toBe(6);
    });

    test("shows the server's reason when a sale is rejected", async ({ page }) => {
        await addLine(page, "Watalappan", 3, 150);
        // Stock changes after the page loaded (e.g. another cashier sold it)
        await query("UPDATE stocks SET quantity = 1 WHERE product_id = 1");
        await page.locator("input[type=date]").fill(ymd(new Date()));
        await page.locator("#customer").selectOption("Kamal Stores");
        await page.getByRole("button", { name: /Post Invoice/ }).click();
        await expectAlert(page, "Save Failed", 'Insufficient stock for "Watalappan". Available: 1, Requested: 3');
        expect(await stockOf(1)).toBe(1);
    });
});
