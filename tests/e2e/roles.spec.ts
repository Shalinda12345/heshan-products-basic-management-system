import { expect, field, mainNav, test } from "./fixtures";

test.describe("staff", () => {
    test.use({ user: "staff" });

    test("see only the sections they work in", async ({ page }) => {
        await page.goto("/");
        // The dashboard is not for staff: they land on New Sale
        await expect(page).toHaveURL(/\/pages\/sales$/);
        const nav = mainNav(page);
        await expect(nav.getByRole("link")).toHaveText(["", "Sales", "Expenses", "Stock", /Saman Staff/]);
        await expect(nav.getByRole("button", { name: "Manage" })).toHaveCount(0);
        await expect(nav).toContainText("Staff");
    });

    test("are stopped at pages their role doesn't include", async ({ page }) => {
        for (const path of ["/reports", "/admin/users", "/admin/products", "/pages/expenses/register", "/pages/expenses/returns"]) {
            await page.goto(path);
            await expect(page).toHaveURL(/\/forbidden$/);
        }
        await expect(page.getByRole("heading", { name: "You don't have access to that page" })).toBeVisible();
        await page.getByRole("link", { name: "Go to my start page" }).click();
        await expect(page).toHaveURL(/\/pages\/sales$/);
    });

    test("can record expenses but not returns", async ({ page }) => {
        await page.goto("/pages/expenses");
        const categories = field(page.locator("form"), "Expense Category / Item");
        await expect(categories).toBeVisible();
        await expect(categories.locator("option")).not.toContainText(["Return"]);
        // No register or returns tabs for staff
        await expect(page.getByRole("navigation", { name: "Expense sections" })).toHaveCount(0);
    });

    test("can move stock but not correct it to a count", async ({ page }) => {
        await page.goto("/pages/stock");
        await expect(page.getByRole("button", { name: "▲ Stock In" })).toBeVisible();
        await expect(page.getByRole("button", { name: "☰ Count" })).toHaveCount(0);
    });

    test("can see invoices but not void them", async ({ page }) => {
        await page.goto("/pages/sales/invoices");
        await expect(page.getByRole("table", { name: "Invoices" }).locator("tbody tr").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Void" })).toHaveCount(0);
    });
});

test.describe("managers", () => {
    test.use({ user: "manager" });

    test("manage products and customers but not user accounts or the activity log", async ({ page }) => {
        await page.goto("/");
        await mainNav(page).getByRole("button", { name: "Manage" }).click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem")).toHaveText([/Products$/, /Customers$/, /Employees$/, /Expense Categories$/]);
        await page.goto("/admin/activity");
        await expect(page).toHaveURL(/\/forbidden$/);
    });
});

test.describe("owners", () => {
    test.use({ user: "owner" });

    test("see the activity log but don't manage user accounts", async ({ page }) => {
        await page.goto("/admin/activity");
        await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
        await page.goto("/admin/users");
        await expect(page).toHaveURL(/\/forbidden$/);
    });
});
