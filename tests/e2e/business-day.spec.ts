import { query, stockOf, ymd } from "../helpers/test-db";
import { expensesTotal, salesTotal } from "./data";
import { expect, expectAlert, field, money, selectOptionContaining, test, type Page } from "./fixtures";

// One working day through every part of the app, checking that each step shows up everywhere it should:
// a new product and customer, stock received, an invoice, a return against it, an expense, then the
// dashboard, reports, registers and activity log, and finally undoing it all with voids.

const today = ymd(new Date());
const dialog = (page: Page) => page.getByRole("dialog");
const status = (page: Page) => page.getByRole("status");

// The Period Financial Summary values on the dashboard
const summaryValue = (page: Page, label: string) =>
    page.locator("p", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::p[1]");

async function addInvoiceLine(page: Page, product: string, quantity: number, price: number) {
    await page.getByRole("button", { name: "Add Invoice Item" }).click();
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add to Invoice" }) });
    await selectOptionContaining(form.locator("select"), product);
    await field(form, "Quantity").fill(String(quantity));
    await field(form, "Unit Price (Rs.)").fill(String(price));
    await form.getByRole("button", { name: "Add to Invoice" }).click();
    await expect(form).toHaveCount(0);
}

const productId = async (name: string) =>
    (await query<{ product_id: number }>("SELECT product_id FROM products WHERE product_name = ?", [name]))[0].product_id;
const grandTotal = async (saleId: number) =>
    Number((await query<{ grand_total: number }>("SELECT grand_total FROM sales WHERE sale_id = ?", [saleId]))[0].grand_total);

test("a full business day, from a new product to the reports, and undone again with voids", async ({ page }) => {
    test.setTimeout(120_000);
    const salesBefore = await salesTotal([today, today]);
    const expensesBefore = await expensesTotal([today, today]);

    // ── Manage: a new product and a new customer ──────────────────────────────
    await page.goto("/admin/products");
    await page.getByRole("button", { name: "+ Add product" }).click();
    await dialog(page).getByLabel("Product name").fill("Kiri Toffee");
    await dialog(page).getByLabel("Selling price (Rs.)").fill("50");
    await dialog(page).getByLabel("Unit cost (Rs.)").fill("30");
    await dialog(page).getByRole("button", { name: "Add product" }).click();
    await expect(page.getByRole("table", { name: "Products" })).toContainText("Kiri Toffee");
    const toffee = await productId("Kiri Toffee");

    await page.goto("/admin/customers");
    await page.getByRole("button", { name: "+ Add customer" }).click();
    await dialog(page).getByLabel("Customer name").fill("Ravi Traders");
    await dialog(page).getByLabel("Phone").fill("0771112223");
    await dialog(page).getByRole("button", { name: "Add customer" }).click();
    await expect(status(page)).toContainText('Added "Ravi Traders"');
    await expect(page.getByRole("table", { name: "Customers" })).toContainText("Ravi Traders");

    // ── Stock: the morning batch arrives ──────────────────────────────────────
    await page.goto("/pages/stock");
    const stockForm = page.getByRole("form", { name: "Stock movement form" });
    await selectOptionContaining(field(stockForm, "Product"), "Kiri Toffee");
    await field(stockForm, "Quantity").fill("40");
    await page.getByRole("button", { name: "Add Stock" }).click();
    await expectAlert(page, "Stock Added", 'Successfully added 40 units of "Kiri Toffee". New balance: 40.');
    expect(await stockOf(toffee)).toBe(40);

    // ── Sales: an invoice for the new customer ────────────────────────────────
    await page.goto("/pages/sales");
    await expect(page.getByRole("button", { name: "Add Invoice Item" })).toBeEnabled();
    await addInvoiceLine(page, "Kiri Toffee", 10, 50);
    await addInvoiceLine(page, "Watalappan", 2, 150);
    await expect(page.getByText("Rs. 800.00")).toBeVisible();
    await page.locator("input[type=date]").fill(today);
    await page.locator("#customer").selectOption("Ravi Traders");
    await page.getByRole("button", { name: /Post Invoice/ }).click();
    await expectAlert(page, "Invoice Posted", "Invoice #7 for Ravi Traders has been saved");
    expect(await stockOf(toffee)).toBe(30);
    expect(await stockOf(1)).toBe(98);

    // ── Returns: two toffees come back unopened ───────────────────────────────
    await page.goto("/pages/expenses");
    const expenseForm = page.locator("form").filter({ has: page.locator("input[type=date]") });
    await field(expenseForm, "Expenditure Date").fill(today);
    await field(expenseForm, "Expense Category / Item").selectOption("Return");
    await field(expenseForm, "Return Type").selectOption("sale_reduction_return");
    await expenseForm.locator("tbody tr").filter({ has: page.locator("td", { hasText: /^#7$/ }) }).click();
    await selectOptionContaining(field(expenseForm, "Select Item to Return"), "Kiri Toffee");
    await field(expenseForm, "Return Quantity").fill("2");
    await selectOptionContaining(field(expenseForm, "Credit Stock Item (returned goods go to)"), "Kiri Toffee");
    await page.getByRole("button", { name: "Submit Sale Reduction Return" }).click();
    await expectAlert(page, "Return Processed", "Sale #7 reduced and stock credited.");
    expect(await grandTotal(7)).toBe(700);
    expect(await stockOf(toffee)).toBe(32);

    // ── Expenses: delivery transport ──────────────────────────────────────────
    await field(expenseForm, "Expenditure Date").fill(today);
    await field(expenseForm, "Expense Category / Item").selectOption("Transport");
    await field(expenseForm, "Expense Amount (Rs.)").fill("200");
    await page.getByRole("button", { name: "Post Expenditure Entry" }).click();
    await expectAlert(page, "Expense Saved", `"Transport" — Rs. 200.00 recorded on ${today}.`);

    // ── The dashboard's Today view adds it all up ─────────────────────────────
    await page.goto("/");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    const revenue = salesBefore + 700;
    const spent = expensesBefore + 200;
    await expect(summaryValue(page, "Gross Revenue")).toHaveText(`LKR ${money(revenue)}`);
    await expect(summaryValue(page, "Total Expenses")).toHaveText(`LKR ${money(spent)}`);
    await expect(summaryValue(page, "Net Profit")).toHaveText(`LKR ${money(revenue - spent)}`);

    // ── Registers ─────────────────────────────────────────────────────────────
    await page.goto("/pages/sales/invoices");
    const invoice = page.getByRole("table", { name: "Invoices" }).locator("tbody tr").filter({ hasText: "#7" });
    await expect(invoice).toContainText("Ravi Traders");
    await expect(invoice).toContainText("700.00");

    await page.goto("/pages/expenses/returns");
    const returnRow = page.getByRole("table", { name: "Returns" }).locator("tbody tr").first();
    await expect(returnRow).toContainText("2 × Kiri Toffee");
    await expect(returnRow).toContainText("#7");
    await expect(returnRow).toContainText("100.00");

    // ── Reports: the product report knows the new product's net sales and margin ──
    await page.goto("/reports/products");
    const productRow = page.getByRole("table", { name: "Product performance" }).locator("tbody tr").filter({ hasText: "Kiri Toffee" });
    await expect(productRow).toBeVisible();
    await expect(productRow).toContainText("400.00");

    await page.goto("/reports/customers");
    await expect(page.getByRole("table", { name: "Customer performance" }).locator("tbody tr").filter({ hasText: "Ravi Traders" })).toContainText("700.00");

    // ── Activity log: every step, by the person who did it ────────────────────
    await page.goto("/admin/activity");
    const activity = page.getByRole("table", { name: "Activity" });
    for (const text of ["Kiri Toffee", "Ravi Traders", "#7", "Transport"]) {
        await expect(activity.locator("tbody tr").filter({ hasText: text }).first()).toContainText("Asha Admin");
    }

    // ── Undo: void the return, then the invoice, then the expense ─────────────
    await page.goto("/pages/expenses/returns");
    await page.getByRole("table", { name: "Returns" }).locator("tbody tr").first().getByRole("button", { name: "Void" }).click();
    await dialog(page).getByLabel("Reason").fill("Entered against the wrong invoice");
    await dialog(page).getByRole("button", { name: "Void" }).click();
    await expect(status(page)).toBeVisible();
    expect(await grandTotal(7)).toBe(800);
    expect(await stockOf(toffee)).toBe(30);

    await page.goto("/pages/sales/invoices");
    await invoice.getByRole("button", { name: "Void" }).click();
    await dialog(page).getByLabel("Reason").fill("Customer cancelled");
    await dialog(page).getByRole("button", { name: "Void" }).click();
    await expect(status(page)).toContainText("Invoice #7 has been voided.");
    expect(await stockOf(toffee)).toBe(40);
    expect(await stockOf(1)).toBe(100);

    await page.goto("/pages/expenses/register");
    await page.getByLabel("From date").fill(today);
    await page.getByLabel("To date").fill(today);
    const expenseRow = page.getByRole("table", { name: "Expenses" }).locator("tbody tr").filter({ hasText: "Transport" }).filter({ hasText: "200.00" });
    await expenseRow.getByRole("button", { name: "Void" }).click();
    await expect(dialog(page)).toContainText("will be removed from all totals");
    await dialog(page).getByLabel("Reason").fill("Paid by the customer");
    await dialog(page).getByRole("button", { name: "Void" }).click();
    await expect(status(page)).toBeVisible();

    // Back where the day started
    await page.goto("/");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(summaryValue(page, "Gross Revenue")).toHaveText(`LKR ${money(salesBefore)}`);
    await expect(summaryValue(page, "Total Expenses")).toHaveText(`LKR ${money(expensesBefore)}`);
});
