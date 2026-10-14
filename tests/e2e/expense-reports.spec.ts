import { monthRange, query, weekRange, ymd } from "../helpers/test-db";
import { expenseCount, expensesTotal } from "./data";
import { expect, money, test, type Page } from "./fixtures";

const now = new Date();
const rows = (page: Page) => page.locator("tbody tr");

async function expectExpenses(page: Page, range: [string, string]) {
    await expect(rows(page)).toHaveCount(await expenseCount(range));
    await expect(page.getByText(`Rs.${money(await expensesTotal(range))}`).first()).toBeVisible();
}

test.describe("expense reports", () => {
    test.beforeEach(async () => {
        await query(
            "INSERT INTO expenses (expense_name, employee_name, quantity, per_expense_amount, total, expense_date) VALUES ('Salary', 'Ruwan Perera', 1, 45000, 45000, ?)",
            [ymd(now)]
        );
    });

    test("weekly statement lists Monday to Sunday", async ({ page }) => {
        await page.goto("/pages/expenses/weekly-expenses");
        await expectExpenses(page, weekRange(now));
    });

    test("monthly audit lists the current month", async ({ page }) => {
        await page.goto("/pages/expenses/monthly-expenses");
        await expectExpenses(page, monthRange(now.getFullYear(), now.getMonth() + 1));
    });

    test("custom report moves between months", async ({ page }) => {
        await page.goto("/pages/expenses/custom-expenses");
        await expectExpenses(page, monthRange(now.getFullYear(), now.getMonth() + 1));
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await page.getByTitle("Previous Month").click();
        await expectExpenses(page, monthRange(previous.getFullYear(), previous.getMonth() + 1));
    });

    test("shows the employee on salary rows and finds them by employee name", async ({ page }) => {
        await page.goto("/pages/expenses/monthly-expenses");
        await expect(rows(page).filter({ hasText: "Salary" })).toContainText("Ruwan Perera");
        await page.getByPlaceholder("Search by expense category...").fill("ruwan");
        await expect(rows(page)).toHaveCount(1);
        // Transport is seeded on the 1st and the last day of the month
        await page.getByPlaceholder("Search by expense category...").fill("transport");
        await expect(rows(page)).toHaveCount(2);
    });
});
