import { query, stockOf, ymd } from "../helpers/test-db";
import { expect, expectAlert, field, selectOptionContaining, test, type Page } from "./fixtures";

// Seeded sale #1: Watalappan 10 @150 + Yogurt 5 @80 = 1900. Sale #2: Curd Pot 2 @1200 = 2400.
const form = (page: Page) => page.locator("form").filter({ has: page.locator("input[type=date]") });
const grandTotal = async (saleId: number) => (await query("SELECT grand_total FROM sales WHERE sale_id = ?", [saleId]))[0].grand_total;

async function startReturn(page: Page, returnType: string) {
    await field(form(page), "Expenditure Date").fill(ymd(new Date()));
    await field(form(page), "Expense Category / Item").selectOption("Return");
    await field(form(page), "Return Type").selectOption(returnType);
}

async function pickSaleLine(page: Page, saleId: number, product: string) {
    await form(page).locator("tbody tr").filter({ has: page.locator("td", { hasText: new RegExp(`^#${saleId}$`) }) }).click();
    const item = field(form(page), "Select Item to Return");
    await expect(item.locator("option", { hasText: product })).toHaveCount(1);
    await selectOptionContaining(item, product);
}

test.describe("returns", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/pages/expenses");
        await expect(field(form(page), "Expense Category / Item")).toBeVisible();
    });

    test("stock expense return: writes off damaged stock as an expense", async ({ page }) => {
        await startReturn(page, "stock_expense_return");
        await selectOptionContaining(field(form(page), "Choose a Product to Return"), "Yogurt");
        await field(form(page), "Quantity").fill("3");
        await field(form(page), "Amount per Unit (Rs.)").fill("80");
        await expect(form(page)).toContainText("Rs. 240.00");
        await page.getByRole("button", { name: "Submit Stock Expense Return" }).click();
        await expectAlert(page, "Return Processed", '"Yogurt"');
        expect(await stockOf(2)).toBe(47);
        await expect(page.locator("table").filter({ hasText: "Entry ID" })).toContainText("Stock Expense Return: Yogurt");
    });

    test("sale reduction return: reduces the sale and puts the goods back in stock", async ({ page }) => {
        await startReturn(page, "sale_reduction_return");
        await pickSaleLine(page, 1, "Watalappan");
        await expect(field(form(page), "Selling Price (Rs.)")).toHaveValue("150");
        await field(form(page), "Return Quantity").fill("2");
        await selectOptionContaining(field(form(page), "Credit Stock Item (returned goods go to)"), "Watalappan");
        await expect(form(page)).toContainText("Rs. 300.00");
        await page.getByRole("button", { name: "Submit Sale Reduction Return" }).click();
        await expectAlert(page, "Return Processed", "Sale #1 reduced and stock credited.");
        expect(await grandTotal(1)).toBe(1600);
        expect(await stockOf(1)).toBe(102);
    });

    test("sale reduction expense return: reduces the sale and records the write-off", async ({ page }) => {
        await startReturn(page, "sale_reduction_expense_return");
        await pickSaleLine(page, 2, "Curd Pot");
        await field(form(page), "Return Quantity").fill("1");
        await field(form(page), "Expense Rate per Unit (Rs.)").fill("500");
        await page.getByRole("button", { name: "Submit Sale Reduction Expense Return" }).click();
        await expectAlert(page, "Return Processed", "Sale #2 reduced and expense recorded.");
        expect(await grandTotal(2)).toBe(1200);
        expect(await stockOf(3)).toBe(5);
        const [expense] = await query("SELECT total FROM expenses WHERE expense_name = 'Sale Reduction Expense Return: Curd Pot'");
        expect(expense.total).toBe(500);
    });

    test("explains why a refund above the sale line's value is refused", async ({ page }) => {
        await startReturn(page, "sale_reduction_return");
        await pickSaleLine(page, 1, "Yogurt");
        await field(form(page), "Return Quantity").fill("1");
        await field(form(page), "Selling Price (Rs.)").fill("1000");
        await selectOptionContaining(field(form(page), "Credit Stock Item (returned goods go to)"), "Yogurt");
        await page.getByRole("button", { name: "Submit Sale Reduction Return" }).click();
        await expectAlert(page, "Return Failed", 'Return amount Rs. 1000.00 exceeds the Rs. 400.00 remaining for "Yogurt" in Sale #1.');
        expect(await grandTotal(1)).toBe(1900);
    });

    test("blocks returning more units than were sold", async ({ page }) => {
        await startReturn(page, "sale_reduction_return");
        await pickSaleLine(page, 1, "Yogurt");
        await field(form(page), "Return Quantity").fill("9");
        await selectOptionContaining(field(form(page), "Credit Stock Item (returned goods go to)"), "Yogurt");
        await page.getByRole("button", { name: "Submit Sale Reduction Return" }).click();
        // The quantity input has max = sold quantity, so the browser refuses to submit
        expect(await field(form(page), "Return Quantity").evaluate((el) => (el as HTMLInputElement).validity.rangeOverflow)).toBe(true);
        expect(await grandTotal(1)).toBe(1900);
    });
});
