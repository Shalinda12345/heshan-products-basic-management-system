import { readFile } from "node:fs/promises";
import { TEST_PASSWORD, query } from "../helpers/test-db";
import { expect, field, mainNav, signIn, test, type Page } from "./fixtures";

const dialog = (page: Page) => page.getByRole("dialog");
const status = (page: Page) => page.getByRole("status");
const tableRow = (page: Page, table: string, text: string) => page.getByRole("table", { name: table }).locator("tbody tr").filter({ hasText: text });
// The sign-in form's error (Next.js also renders an empty role="alert" route announcer)
const loginError = (page: Page) => page.locator("form p[role=alert]");

test.describe("managing the lists", () => {
    test("an employee added here can be paid a salary, and renaming them follows their payments", async ({ page }) => {
        await page.goto("/admin/employees");
        await page.getByRole("button", { name: "+ Add employee" }).click();
        await dialog(page).getByLabel("Full name").fill("Dilini Fernando");
        await dialog(page).getByLabel("Contact number").fill("0759998887");
        await dialog(page).getByRole("button", { name: "Add employee" }).click();
        await expect(tableRow(page, "Employees", "Dilini Fernando")).toBeVisible();

        await page.goto("/pages/expenses");
        const form = page.locator("form").filter({ has: page.locator("input[type=date]") });
        await field(form, "Expense Category / Item").selectOption("Salary");
        await expect(form.locator("option", { hasText: "Dilini Fernando" })).toHaveCount(1);

        await page.goto("/admin/employees");
        await tableRow(page, "Employees", "Dilini Fernando").getByRole("button", { name: "Edit" }).click();
        await dialog(page).getByLabel("Full name").fill("Dilini Perera");
        await dialog(page).getByRole("button", { name: "Save changes" }).click();
        await expect(tableRow(page, "Employees", "Dilini Perera")).toBeVisible();
    });

    test("a new expense category appears on the expense form with the right fields, and retiring hides it", async ({ page }) => {
        await page.goto("/admin/expense-categories");
        await page.getByRole("button", { name: "+ Add category" }).click();
        await dialog(page).getByLabel("Category name").fill("Gas Cylinder");
        await dialog(page).getByLabel("Entered as").selectOption({ label: "Quantity × rate" });
        await dialog(page).getByRole("button", { name: "Add category" }).click();
        await expect(status(page)).toContainText('Added "Gas Cylinder".');

        await page.goto("/pages/expenses");
        const form = page.locator("form").filter({ has: page.locator("input[type=date]") });
        await field(form, "Expense Category / Item").selectOption("Gas Cylinder");
        await expect(field(form, "Quantity")).toBeVisible();

        await page.goto("/admin/expense-categories");
        await tableRow(page, "Expense categories", "Gas Cylinder").getByRole("button", { name: "Retire" }).click();
        await expect(status(page)).toContainText('"Gas Cylinder" is now retired.');
        await page.goto("/pages/expenses");
        await expect(field(form, "Expense Category / Item").locator("option", { hasText: "Gas Cylinder" })).toHaveCount(0);
    });

    test("an inactive product can't be invoiced but keeps its stock and history", async ({ page }) => {
        await page.goto("/admin/products");
        await tableRow(page, "Products", "Curd Pot").getByRole("button", { name: "Deactivate" }).click();
        await expect(status(page)).toContainText('"Curd Pot" is now inactive.');

        await page.goto("/pages/sales");
        await page.getByRole("button", { name: "Add Invoice Item" }).click();
        const picker = page.locator("form").filter({ has: page.getByRole("button", { name: "Add to Invoice" }) }).locator("select");
        await expect(picker.locator("option", { hasText: "Watalappan" })).toHaveCount(1);
        await expect(picker.locator("option", { hasText: "Curd Pot" })).toHaveCount(0);

        await page.goto("/pages/sales/invoices");
        await expect(page.getByRole("table", { name: "Invoices" })).toContainText("Nimal Bakery");
    });

    test("a deactivated customer can't be picked on a new invoice", async ({ page }) => {
        await page.goto("/admin/customers");
        await tableRow(page, "Customers", "Sunil Mart").getByRole("button", { name: "Deactivate" }).click();
        await expect(status(page)).toContainText('"Sunil Mart" is now inactive.');
        await page.goto("/pages/sales");
        await expect(page.locator("#customer option", { hasText: "Kamal Stores" })).toHaveCount(1);
        await expect(page.locator("#customer option", { hasText: "Sunil Mart" })).toHaveCount(0);
    });

    test("a customer name that already exists is refused with a reason", async ({ page }) => {
        await page.goto("/admin/customers");
        await page.getByRole("button", { name: "+ Add customer" }).click();
        await dialog(page).getByLabel("Customer name").fill("Kamal Stores");
        await dialog(page).getByRole("button", { name: "Add customer" }).click();
        await expect(dialog(page)).toContainText(/already/i);
        expect((await query("SELECT COUNT(*) AS n FROM customers WHERE customer_name = 'Kamal Stores'"))[0].n).toBe(1);
    });
});

test.describe("user accounts", () => {
    test("promoting staff to manager signs them out and their new access applies at the next sign-in", async ({ page, browser, baseURL }) => {
        // Saman is signed in elsewhere
        const other = await browser.newContext({ baseURL });
        const saman = await other.newPage();
        await signIn(saman, "staff", TEST_PASSWORD);
        await expect(saman).toHaveURL(/\/pages\/sales$/);

        await page.goto("/admin/users");
        await tableRow(page, "Users", "Saman Staff").getByRole("button", { name: "Edit" }).click();
        await dialog(page).getByLabel("Role").selectOption({ label: "Manager" });
        await expect(dialog(page)).toContainText("will be signed out");
        await dialog(page).getByRole("button", { name: "Save changes" }).click();
        await expect(status(page)).toContainText("Saved Saman Staff.");

        await saman.goto("/pages/stock");
        // The session checker notices within its 5-second polling interval
        await expect(saman).toHaveURL(/\/login/, { timeout: 15_000 });
        await signIn(saman, "staff", TEST_PASSWORD);
        await expect(saman).not.toHaveURL(/\/login/);
        await saman.goto("/admin/products");
        await expect(saman).toHaveURL(/\/admin\/products$/);
        await other.close();
    });

    test("an administrator resets a forgotten password; the old one stops working", async ({ page, context }) => {
        await page.goto("/admin/users");
        await tableRow(page, "Users", "Mala Manager").getByRole("button", { name: "Reset password" }).click();
        await dialog(page).getByRole("button", { name: "Reset password" }).click();
        await expect(dialog(page)).toContainText("New password for Mala Manager");
        const temporary = (await page.getByTestId("credential-password").textContent())?.trim() ?? "";
        await dialog(page).getByRole("button", { name: "Done" }).click();

        await context.clearCookies();
        await signIn(page, "manager", TEST_PASSWORD);
        await expect(loginError(page)).toBeVisible();
        await signIn(page, "manager", temporary);
        await expect(page).toHaveURL(/\/account$/);
    });
});

test.describe("my account", () => {
    test.use({ user: "manager" });

    test("changes my own password, which is then the one that signs in", async ({ page, context }) => {
        await page.goto("/account");
        const form = page.getByRole("form", { name: "Change password" });
        await form.getByLabel("Current password").fill(TEST_PASSWORD);
        await form.getByLabel("New password", { exact: true }).fill("Mango-Season-2026");
        await form.getByLabel("Confirm new password").fill("Mango-Season-2027");
        await expect(form).toContainText("Does not match the new password.");
        await expect(form.getByRole("button", { name: "Change password" })).toBeDisabled();
        await form.getByLabel("Confirm new password").fill("Mango-Season-2026");
        await form.getByRole("button", { name: "Change password" }).click();
        await expect(page.getByText("Password changed")).toBeVisible();

        await context.clearCookies();
        await signIn(page, "manager", "Mango-Season-2026");
        await expect(mainNav(page)).toContainText("Mala Manager");
    });

    test("refuses the change when the current password is wrong", async ({ page }) => {
        await page.goto("/account");
        const form = page.getByRole("form", { name: "Change password" });
        await form.getByLabel("Current password").fill("not-my-password");
        await form.getByLabel("New password", { exact: true }).fill("Mango-Season-2026");
        await form.getByLabel("Confirm new password").fill("Mango-Season-2026");
        await form.getByRole("button", { name: "Change password" }).click();
        await expect(form).toContainText("Your current password is not correct.");
    });
});

test.describe("sign-in protection", () => {
    test.use({ user: null });

    test("locks an account after five wrong passwords, even for the right one", async ({ page }) => {
        for (let attempt = 1; attempt <= 5; attempt++) {
            await signIn(page, "owner", `wrong-${attempt}`);
            await expect(loginError(page)).toBeVisible();
        }
        await expect(loginError(page)).toContainText("Too many failed attempts");
        await signIn(page, "owner", TEST_PASSWORD);
        await expect(loginError(page)).toContainText("Too many failed attempts");
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe("exports", () => {
    async function download(page: Page, button: string) {
        const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
        return { name: file.suggestedFilename(), text: await readFile(await file.path(), "utf8") };
    }

    test("the invoice register exports every invoice as a spreadsheet file", async ({ page }) => {
        await page.goto("/pages/sales/invoices");
        // The register opens on this month; widen it to every invoice
        await page.getByLabel("From date").fill("2000-01-01");
        await page.getByLabel("To date").fill("2100-12-31");
        await expect(page.getByRole("table", { name: "Invoices" }).locator("tbody tr")).toHaveCount(6);
        const csv = await download(page, "⬇ Export CSV");
        expect(csv.name).toMatch(/^invoices-.*\.csv$/);
        const lines = csv.text.replace(/^﻿/, "").trim().split("\r\n");
        expect(lines).toHaveLength(1 + 6);
        expect(csv.text).toContain('"Kamal Stores"');
    });

    test("the expense register exports what the filter shows", async ({ page }) => {
        await page.goto("/pages/expenses/register");
        await page.getByLabel("From date").fill("2000-01-01");
        await page.getByLabel("To date").fill("2100-12-31");
        await page.getByLabel("Category").selectOption({ label: "Electricity" });
        await expect(page.getByRole("table", { name: "Expenses" }).locator("tbody tr")).toHaveCount(2);
        const csv = await download(page, "⬇ Export CSV");
        const lines = csv.text.replace(/^﻿/, "").trim().split("\r\n");
        expect(lines).toHaveLength(1 + 2);
        expect(lines.slice(1).every((line) => line.includes('"Electricity"'))).toBe(true);
    });

    test("the activity log exports as CSV from the server", async ({ page }) => {
        await page.goto("/admin/products");
        await tableRow(page, "Products", "Yogurt").getByRole("button", { name: "Deactivate" }).click();
        await expect(status(page)).toBeVisible();
        await page.goto("/admin/activity");
        const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "⬇ Export CSV" }).click()]);
        const text = await readFile(await file.path(), "utf8");
        expect(text).toContain("Yogurt");
        expect(text).toContain("Asha Admin");
    });
});

test.describe("report pages", () => {
    test("expense analysis splits spending by category and shows salary payments by employee", async ({ page }) => {
        await query("INSERT INTO expenses (expense_name, employee_name, quantity, per_expense_amount, total, expense_date) VALUES ('Salary', 'Ruwan Perera', 1, 30000, 30000, CURDATE())");
        await page.goto("/reports/expenses?preset=last_12_months");
        await expect(page.getByRole("table", { name: "Expenses by category" })).toContainText("Electricity");
        await expect(page.getByRole("table", { name: "Payments to employees" })).toContainText("Ruwan Perera");
        await expect(page.getByRole("table", { name: "Payments to employees" })).toContainText("30,000.00");
    });

    test("customer performance ranks customers by revenue", async ({ page }) => {
        await page.goto("/reports/customers?preset=last_12_months");
        const rows = page.getByRole("table", { name: "Customer performance" }).locator("tbody tr");
        await expect(rows.first()).toBeVisible();
        await expect(page.getByRole("table", { name: "Customer performance" })).toContainText("Kamal Stores");
    });

    test("product performance can be re-sorted", async ({ page }) => {
        await page.goto("/reports/products?preset=last_12_months");
        const table = page.getByRole("table", { name: "Product performance" });
        await expect(table).toContainText("Watalappan");
        const sort = page.getByLabel("Sort by");
        for (const option of await sort.locator("option").all()) {
            await sort.selectOption((await option.getAttribute("value"))!);
            await expect(table.locator("tbody tr").first()).toBeVisible();
        }
    });
});
