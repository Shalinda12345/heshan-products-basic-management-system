import { SESSION_COOKIE } from "@/app/lib/session";
import { TEST_PASSWORD, query, sessionTokenFor } from "../helpers/test-db";
import { expect, mainNav, signIn, test } from "./fixtures";

test.use({ user: null });

test.describe("authentication", () => {
    test("sends a signed-out visitor to the login page", async ({ page }) => {
        for (const path of ["/", "/pages/sales", "/pages/expenses", "/pages/stock", "/pages/sales/monthly-sales", "/admin/users", "/reports"]) {
            await page.goto(path);
            await expect(page).toHaveURL(/\/login(\?next=.*)?$/);
        }
        await expect(mainNav(page)).toHaveCount(0);
    });

    test("rejects a wrong password and keeps the typed username", async ({ page }) => {
        await signIn(page, "admin", "wrong-password1");
        await expect(page.locator("p[role=alert]")).toHaveText("Invalid username or password.");
        await expect(page.locator("#username")).toHaveValue("admin");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("signs in with valid credentials and shows the navigation with who is signed in", async ({ page, context }) => {
        await signIn(page, "admin", TEST_PASSWORD);
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole("heading", { name: "Business Intelligence" })).toBeVisible();
        for (const link of ["Dashboard", "Sales", "Expenses", "Stock", "Reports"]) {
            await expect(mainNav(page).getByRole("link", { name: link, exact: true })).toBeVisible();
        }
        await expect(mainNav(page)).toContainText("Asha Admin");
        await expect(mainNav(page)).toContainText("Administrator");
        const cookie = (await context.cookies()).find((c) => c.name === "auth_token");
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.value).toMatch(/^v2\.[\w-]+\.[\w-]+$/);
    });

    test("returns to the page that was asked for after signing in", async ({ page }) => {
        await page.goto("/pages/stock");
        await expect(page).toHaveURL(/\/login\?next=%2Fpages%2Fstock$/);
        await page.locator("#username").fill("manager");
        await page.locator("#password").fill(TEST_PASSWORD);
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page).toHaveURL(/\/pages\/stock$/);
    });

    test("signs out and protects pages again", async ({ page, context }) => {
        await signIn(page, "admin", TEST_PASSWORD);
        await expect(page).toHaveURL(/\/$/);

        await mainNav(page).getByRole("button", { name: "Sign out" }).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(mainNav(page)).toHaveCount(0);
        expect((await context.cookies()).some((c) => c.name === "auth_token")).toBe(false);

        await page.goto("/pages/sales/monthly-sales");
        await expect(page).toHaveURL(/\/login/);
        const actions = (await query<{ action: string }>("SELECT action FROM activity_log ORDER BY activity_id")).map((r) => r.action);
        expect(actions).toEqual(["auth.login", "auth.logout"]);
    });

    test("refuses a disabled account", async ({ page }) => {
        await signIn(page, "former", TEST_PASSWORD);
        await expect(page.locator("p[role=alert]")).toHaveText("This account has been disabled. Ask an administrator to enable it.");
    });

    test("ignores a forged session cookie", async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: "auth_token", value: "logged_in", url: baseURL! }]);
        await page.goto("/pages/stock");
        await expect(page).toHaveURL(/\/login/);
    });

    test("protects the API: no session means 401 and nothing is saved", async ({ request }) => {
        const response = await request.post("/api/sales/save-sales", {
            data: { customer_name: "X", sale_date: "2026-01-01", items: [{ product_name: "Yogurt", quantity: 1, selling_price: 1 }] },
        });
        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect((await request.get("/api/stock")).status()).toBe(401);
    });

    // Checked from inside the page, like the app's session checker (the session cookie is Secure in production
    // builds, which browsers allow on localhost but Playwright's separate request client does not send over http)
    test("session check endpoint reports the session state", async ({ page }) => {
        const check = () => page.evaluate(() => fetch("/api/auth/check").then((r) => r.json()));
        await page.goto("/login");
        expect(await check()).toEqual({ authenticated: false });
        await signIn(page, "admin", TEST_PASSWORD);
        await expect(page).toHaveURL(/\/$/);
        expect(await check()).toEqual({ authenticated: true });
    });

    test("keeps an active user signed in past the original hour", async ({ page, context, baseURL }) => {
        // A session signed in 45 minutes ago has 15 minutes left
        const ageing = await sessionTokenFor("admin", Date.now() - 45 * 60 * 1000);
        await context.addCookies([{ name: SESSION_COOKIE, value: ageing, url: baseURL! }]);
        await page.goto("/pages/sales");
        await expect(page).toHaveURL(/\/pages\/sales$/);
        const renewed = (await context.cookies()).find((c) => c.name === SESSION_COOKIE)?.value;
        expect(renewed).not.toBe(ageing);
    });

    test("signs a user out within seconds when an administrator disables them", async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: SESSION_COOKIE, value: await sessionTokenFor("staff"), url: baseURL! }]);
        await page.goto("/pages/sales");
        await expect(mainNav(page)).toBeVisible();
        await query("UPDATE users SET is_active = 0 WHERE username = 'staff'");
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
});

test.describe("first sign-in with a temporary password", () => {
    test("must choose a new password before anything else", async ({ page }) => {
        await query("UPDATE users SET must_change_password = 1 WHERE username = 'manager'");
        await signIn(page, "manager", TEST_PASSWORD);
        await expect(page).toHaveURL(/\/account$/);
        await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
        await expect(mainNav(page)).toHaveCount(0);

        // Other pages send them back here
        await page.goto("/pages/sales");
        await expect(page).toHaveURL(/\/account$/);

        await page.getByLabel("Temporary password").fill(TEST_PASSWORD);
        await page.getByLabel("New password", { exact: true }).fill("Coconut-Milk-77");
        await page.getByLabel("Confirm new password").fill("Coconut-Milk-77");
        await page.getByRole("button", { name: "Change password" }).click();

        await expect(page).toHaveURL(/\/$/);
        await expect(mainNav(page)).toBeVisible();
        expect((await query<{ must_change_password: number }>("SELECT must_change_password FROM users WHERE username = 'manager'"))[0].must_change_password).toBe(0);
    });
});
