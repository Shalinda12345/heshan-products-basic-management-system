import { SESSION_COOKIE, createSessionToken } from "@/app/lib/session";
import { expect, test } from "./fixtures";

test.use({ signedIn: false });

test.describe("authentication", () => {
    test("sends a signed-out visitor to the login page", async ({ page }) => {
        for (const path of ["/", "/pages/sales", "/pages/expenses", "/pages/stock", "/pages/sales/monthly-sales"]) {
            await page.goto(path);
            await expect(page).toHaveURL(/\/login$/);
        }
        await expect(page.locator("nav")).toHaveCount(0);
    });

    test("rejects a wrong password and keeps the typed username", async ({ page }) => {
        await page.goto("/login");
        await page.locator("#username").fill("admin");
        await page.locator("#password").fill("wrong");
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page.locator("p[role=alert]")).toHaveText("Invalid username or password.");
        await expect(page.locator("#username")).toHaveValue("admin");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("signs in with valid credentials and shows the navigation", async ({ page, context }) => {
        await page.goto("/login");
        await page.locator("#username").fill("admin");
        await page.locator("#password").fill("admin");
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole("heading", { name: "Business Intelligence" })).toBeVisible();
        for (const link of ["Dashboard", "Sales", "Expenses", "Stock"]) {
            await expect(page.locator("nav").getByRole("link", { name: link, exact: true })).toBeVisible();
        }
        const cookie = (await context.cookies()).find((c) => c.name === "auth_token");
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.value).toMatch(/^v1\.\d+\.[\w-]+$/);
    });

    test("signs out and protects pages again", async ({ page, context }) => {
        await page.goto("/login");
        await page.locator("#username").fill("admin");
        await page.locator("#password").fill("admin");
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page).toHaveURL(/\/$/);

        await page.locator("nav").getByRole("button", { name: "Logout" }).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.locator("nav")).toHaveCount(0);
        expect((await context.cookies()).some((c) => c.name === "auth_token")).toBe(false);

        await page.goto("/pages/sales/monthly-sales");
        await expect(page).toHaveURL(/\/login$/);
    });

    test("ignores a forged session cookie", async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: "auth_token", value: "logged_in", url: baseURL! }]);
        await page.goto("/pages/stock");
        await expect(page).toHaveURL(/\/login$/);
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
        await page.locator("#username").fill("admin");
        await page.locator("#password").fill("admin");
        await page.getByRole("button", { name: "Sign In" }).click();
        await expect(page).toHaveURL(/\/$/);
        expect(await check()).toEqual({ authenticated: true });
    });

    test("keeps an active user signed in past the original hour", async ({ page, context, baseURL }) => {
        // A session signed in 45 minutes ago has 15 minutes left
        const ageing = await createSessionToken(Date.now() - 45 * 60 * 1000);
        await context.addCookies([{ name: SESSION_COOKIE, value: ageing, url: baseURL! }]);
        await page.goto("/pages/sales");
        await expect(page).toHaveURL(/\/pages\/sales$/);
        const renewed = (await context.cookies()).find((c) => c.name === SESSION_COOKIE)?.value;
        expect(renewed).not.toBe(ageing);
        expect(Number(renewed?.split(".")[1])).toBeGreaterThan(Date.now() + 55 * 60 * 1000);
    });
});
