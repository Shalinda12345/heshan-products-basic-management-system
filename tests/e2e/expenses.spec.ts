import { query, ymd } from "../helpers/test-db";
import { expect, expectAlert, field, selectOptionContaining, test, type Page } from "./fixtures";

const today = ymd(new Date());
const form = (page: Page) => page.locator("form").filter({ has: page.locator("input[type=date]") });
const ledgerRows = (page: Page) => page.locator("table").filter({ hasText: "Entry ID" }).locator("tbody tr");
const employeePicker = (page: Page) => form(page).locator("select").filter({ has: page.locator("option", { hasText: "Choose Employee" }) });
const lastExpense = async () => (await query("SELECT * FROM expenses ORDER BY expense_item_id DESC LIMIT 1"))[0];

async function start(page: Page, category: string, date = today) {
    await field(form(page), "Expenditure Date").fill(date);
    await field(form(page), "Expense Category / Item").selectOption(category);
}

test.describe("recording expenses", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/pages/expenses");
        await expect(field(form(page), "Expense Category / Item")).toBeVisible();
    });

    test("records a simple expense, confirms it and lists it in today's ledger", async ({ page }) => {
        await start(page, "Electricity");
        await field(form(page), "Expense Amount (Rs.)").fill("1000");
        await page.getByRole("button", { name: "Post Expenditure Entry" }).click();
        await expectAlert(page, "Expense Saved", `"Electricity" — Rs. 1,000.00 recorded on ${today}.`);
        await expect(ledgerRows(page).filter({ hasText: "Electricity" })).toContainText("Rs.1000.00");
        await expect(page.getByText("Rs.1,000.00")).toBeVisible();
        expect(await lastExpense()).toMatchObject({ expense_name: "Electricity", total: 1000, expense_date: today });
    });

    test("confirms a back-dated expense even though today's ledger doesn't list it", async ({ page }) => {
        await start(page, "Transport", "2026-01-15");
        await field(form(page), "Expense Amount (Rs.)").fill("500");
        await page.getByRole("button", { name: "Post Expenditure Entry" }).click();
        await expectAlert(page, "Expense Saved", "recorded on 2026-01-15");
        await expect(page.getByText("No expenditures registered today.")).toBeVisible();
        expect(await lastExpense()).toMatchObject({ expense_name: "Transport", expense_date: "2026-01-15" });
    });

    test("multiplies quantity by rate for quantity-based items", async ({ page }) => {
        await start(page, "Sugar");
        await field(form(page), "Quantity").fill("4");
        await field(form(page), "Rate per Item").fill("250");
        await expect(form(page)).toContainText("Rs. 1,000.00");
        await page.getByRole("button", { name: "Post Expenditure Entry" }).click();
        await expectAlert(page, "Expense Saved");
        await expect(ledgerRows(page).filter({ hasText: "Sugar" })).toContainText("4 × Rs.250.00");
        expect(await lastExpense()).toMatchObject({ quantity: 4, per_expense_amount: 250, total: 1000 });
    });

    for (const category of ["Salary", "Salary Advance", "Salary Loan"]) {
        test(`${category} asks for an employee and shows a single amount field`, async ({ page }) => {
            await start(page, category);
            await expect(employeePicker(page)).toBeVisible();
            await expect(form(page).locator('label:text-is("Expense Amount (Rs.)")')).toHaveCount(1);
        });
    }

    test("does not save a salary without an employee", async ({ page }) => {
        await start(page, "Salary");
        await field(form(page), "Expense Amount (Rs.)").fill("45000");
        await page.getByRole("button", { name: "Post Expenditure Entry" }).click();
        // The browser blocks the submit because the employee picker is required
        expect(await employeePicker(page).evaluate((el) => (el as HTMLSelectElement).validity.valueMissing)).toBe(true);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect((await query("SELECT COUNT(*) AS n FROM expenses"))[0].n).toBe(5);
    });

    test("saves a salary with its employee and shows the employee in the ledger", async ({ page }) => {
        await start(page, "Salary");
        await selectOptionContaining(employeePicker(page), "Ruwan Perera");
        await field(form(page), "Expense Amount (Rs.)").fill("45000");
        await page.getByRole("button", { name: "Post Expenditure Entry" }).click();
        await expectAlert(page, "Expense Saved", '"Salary" for Ruwan Perera');
        await expect(ledgerRows(page).filter({ hasText: "Salary" })).toContainText("Ruwan Perera");
        expect(await lastExpense()).toMatchObject({ expense_name: "Salary", employee_name: "Ruwan Perera", total: 45000 });

        // The picker starts empty for the next salary entry
        await field(form(page), "Expense Category / Item").selectOption("Salary");
        await expect(employeePicker(page)).toHaveValue("");
    });

    test("only offers the submit button once a category is chosen", async ({ page }) => {
        await expect(page.getByText("Select an expense category to submit.")).toBeVisible();
        await expect(page.getByRole("button", { name: "Post Expenditure Entry" })).toHaveCount(0);
    });
});
