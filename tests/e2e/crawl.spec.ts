import { expect, test, type Page } from "./fixtures";

// Every page of the app, visited the way a user would: each one must render without script errors,
// failed requests or sideways scrolling on a phone.
const PAGES = [
    "/pages/sales", "/pages/sales/daily-sales", "/pages/sales/weekly-sales", "/pages/sales/monthly-sales",
    "/pages/sales/custom-sales", "/pages/sales/items-sold", "/pages/sales/invoices",
    "/pages/expenses", "/pages/expenses/weekly-expenses", "/pages/expenses/monthly-expenses",
    "/pages/expenses/custom-expenses", "/pages/expenses/register", "/pages/expenses/returns",
    "/pages/stock",
    "/reports", "/reports/products", "/reports/customers", "/reports/expenses", "/reports/stock",
    "/admin", "/admin/products", "/admin/customers", "/admin/employees", "/admin/expense-categories",
    "/admin/users", "/admin/activity",
    "/account",
];

// Pages a member of staff may open (see app/lib/permissions.ts)
const STAFF_PAGES = ["/pages/sales", "/pages/sales/invoices", "/pages/expenses", "/pages/stock", "/account"];

// Collects everything that went wrong while a page loaded
function watch(page: Page, baseURL: string) {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`script error: ${error.message}`));
    page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console error: ${message.text()}`);
    });
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin === new URL(baseURL).origin && response.status() >= 400) {
            problems.push(`${response.status()} ${url.pathname}${url.search}`);
        }
    });
    return problems;
}

async function settle(page: Page) {
    await page.waitForLoadState("networkidle");
    // Skeleton rows are replaced once data arrives
    await expect(page.locator("tr.animate-pulse")).toHaveCount(0);
}

async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("every page loads cleanly", () => {
    for (const path of PAGES) {
        test(`${path} on a desktop`, async ({ page, baseURL }) => {
            const problems = watch(page, baseURL!);
            const response = await page.goto(path);
            expect(response?.status()).toBe(200);
            await settle(page);
            await expect(page.getByRole("heading").first()).toBeVisible();
            await expect(page.getByText(/Could not load|Something went wrong|Application error/)).toHaveCount(0);
            expect(problems).toEqual([]);
        });
    }
});

test.describe("every page fits a phone screen", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const path of PAGES) {
        test(`${path} at 390px`, async ({ page, baseURL }) => {
            const problems = watch(page, baseURL!);
            await page.goto(path);
            await settle(page);
            expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
            expect(problems).toEqual([]);
        });
    }
});

test.describe("staff pages load cleanly", () => {
    test.use({ user: "staff" });

    for (const path of STAFF_PAGES) {
        test(`${path} as staff`, async ({ page, baseURL }) => {
            const problems = watch(page, baseURL!);
            await page.goto(path);
            await settle(page);
            await expect(page).toHaveURL(new RegExp(`${path}$`));
            expect(problems).toEqual([]);
        });
    }
});

test.describe("error pages", () => {
    test("an unknown address shows the not-found page with a way back", async ({ page }) => {
        const response = await page.goto("/no-such-page");
        expect(response?.status()).toBe(404);
        await page.locator('main a[href="/"], a[href="/"]').last().click();
        await expect(page).not.toHaveURL(/no-such-page/);
    });
});
