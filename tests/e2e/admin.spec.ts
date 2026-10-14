import { query, stockOf, ymd } from "../helpers/test-db";
import { expect, expectAlert, mainNav, selectOptionContaining, signIn, test, type Page } from "./fixtures";

const dialog = (page: Page) => page.getByRole("dialog");

test.describe("user accounts", () => {
    test("an administrator adds a user, who signs in with the temporary password and chooses their own", async ({ page, context }) => {
        await page.goto("/admin/users");
        await page.getByRole("button", { name: "+ Add user" }).click();
        await dialog(page).getByLabel("Full name").fill("Kasun Perera");
        await dialog(page).getByLabel("Username").fill("kasun");
        await dialog(page).getByLabel("Role").selectOption({ label: "Staff" });
        await dialog(page).getByRole("button", { name: "Create account" }).click();

        await expect(dialog(page)).toContainText("Account created for Kasun Perera");
        const password = (await page.getByTestId("credential-password").textContent())?.trim() ?? "";
        expect(password).toMatch(/^[A-Za-z2-9]{12}$/);
        await dialog(page).getByRole("button", { name: "Done" }).click();
        await expect(page.getByRole("table", { name: "Users" })).toContainText("kasun");

        // The new user signs in somewhere else
        await context.clearCookies();
        await signIn(page, "kasun", password);
        await expect(page).toHaveURL(/\/account$/);
        await page.getByLabel("Temporary password").fill(password);
        await page.getByLabel("New password", { exact: true }).fill("Coconut-Hill-2026");
        await page.getByLabel("Confirm new password").fill("Coconut-Hill-2026");
        await page.getByRole("button", { name: "Change password" }).click();
        await expect(page).toHaveURL(/\/pages\/sales$/);
        await expect(mainNav(page)).toContainText("Kasun Perera");
    });

    test("disabling a user is recorded in the activity log", async ({ page }) => {
        await page.goto("/admin/users");
        await page.getByRole("table", { name: "Users" }).locator("tbody tr").filter({ hasText: "Saman Staff" }).getByRole("button", { name: "Edit" }).click();
        await dialog(page).getByText("Account enabled (can sign in)").click();
        await expect(dialog(page)).toContainText("will be signed out");
        await dialog(page).getByRole("button", { name: "Save changes" }).click();
        await expect(page.getByRole("status")).toContainText("Saved Saman Staff.");

        await page.goto("/admin/activity");
        const entry = page.getByRole("table", { name: "Activity" }).locator("tbody tr").first();
        await expect(entry).toContainText("User updated");
        await expect(entry).toContainText('Updated user "staff": disabled');
        await expect(entry).toContainText("Asha Admin");
    });
});

test.describe("products", () => {
    test("a new product with a price appears on the sales form with that price filled in", async ({ page }) => {
        await page.goto("/admin/products");
        await page.getByRole("button", { name: "+ Add product" }).click();
        await dialog(page).getByLabel("Product name").fill("Jelly Cup");
        await dialog(page).getByLabel("Selling price (Rs.)").fill("120");
        await dialog(page).getByLabel("Unit cost (Rs.)").fill("70");
        await dialog(page).getByLabel("Opening stock").fill("30");
        await expect(dialog(page)).toContainText("Margin per unit: Rs. 50.00 (41.7%)");
        await dialog(page).getByRole("button", { name: "Add product" }).click();
        await expect(page.getByRole("table", { name: "Products" })).toContainText("Jelly Cup");

        await page.goto("/pages/sales");
        await page.getByRole("button", { name: "Add Invoice Item" }).click();
        const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add to Invoice" }) });
        await selectOptionContaining(form.locator("select"), "Jelly Cup");
        await expect(form.locator('label:text-is("Unit Price (Rs.)") + input')).toHaveValue("120");
        expect(await stockOf(7)).toBe(30);
    });
});

test.describe("correcting mistakes", () => {
    test("voiding an invoice puts its items back into stock and marks it void", async ({ page }) => {
        const today = ymd(new Date());
        await query("INSERT INTO sales (sale_id, customer_id, customer_name, grand_total, sale_date) VALUES (50, 1, 'Kamal Stores', 300, ?)", [today]);
        await query("INSERT INTO sale_items (sale_id, product_id, product_name, quantity, selling_price, total) VALUES (50, 1, 'Watalappan', 2, 150, 300)");

        await page.goto("/pages/sales/invoices");
        const row = page.getByRole("table", { name: "Invoices" }).locator("tbody tr").filter({ hasText: "#50" });
        await row.getByRole("button", { name: "Void" }).click();
        await expect(dialog(page)).toContainText("Invoice #50 for Kamal Stores");
        await dialog(page).getByLabel("Reason").fill("Customer cancelled the order");
        await dialog(page).getByRole("button", { name: "Void" }).click();

        await expect(page.getByRole("status")).toContainText("Invoice #50 has been voided.");
        await expect(row).toContainText("Void");
        expect(await stockOf(1)).toBe(102);
        expect((await query<{ status: string }>("SELECT status FROM sales WHERE sale_id = 50"))[0].status).toBe("void");
    });

    test("correcting an expense amount recomputes its total", async ({ page }) => {
        await page.goto("/pages/expenses/register?");
        await page.getByLabel("From date").fill("2000-01-01");
        await page.getByLabel("To date").fill("2100-12-31");
        const row = page.getByRole("table", { name: "Expenses" }).locator("tbody tr").filter({ hasText: "Sugar" });
        await row.getByRole("button", { name: "Correct" }).click();
        await dialog(page).getByLabel("Rate per item (Rs.)").fill("260");
        await expect(dialog(page)).toContainText("New total: Rs. 2,600.00");
        await dialog(page).getByRole("button", { name: "Save correction" }).click();
        await expect(page.getByRole("status")).toContainText("corrected");
        expect((await query<{ total: number }>("SELECT total FROM expenses WHERE expense_name = 'Sugar'"))[0].total).toBe(2600);
    });
});

test.describe("stock count", () => {
    test("a manager sets stock to the physical count", async ({ page }) => {
        await page.goto("/pages/stock");
        await page.getByRole("button", { name: "☰ Count" }).click();
        const form = page.getByRole("form", { name: "Stock movement form" });
        await selectOptionContaining(form.locator('label:text-is("Product") + select'), "Yogurt");
        await page.getByLabel("Counted quantity").fill("47");
        await expect(form).toContainText("−3");
        await page.getByRole("button", { name: "Save Count" }).click();
        await expectAlert(page, "Stock Count Saved", '"Yogurt" corrected by −3 to 47.');
        expect(await stockOf(2)).toBe(47);
    });
});
