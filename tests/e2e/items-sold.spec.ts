import { monthRange, weekRange, ymd } from "../helpers/test-db";
import { addSale, unitsSold } from "./data";
import { expect, test, type Page } from "./fixtures";

const now = new Date();
const today = ymd(now);
const unitsTile = (page: Page) => page.locator("span", { hasText: /^Total Units Sold$/ }).locator("xpath=../following-sibling::p[1]");
const expectUnits = async (page: Page, range: [string, string]) => expect(unitsTile(page)).toHaveText(String(await unitsSold(range)));

test.describe("items sold page", () => {
    test.beforeEach(async ({ page }) => {
        await addSale(today, "Kamal Stores", [["Watalappan", 3, 150], ["Yogurt", 2, 80]]);
        await page.goto("/pages/sales/items-sold");
    });

    test("daily, weekly and monthly tabs total their own periods", async ({ page }) => {
        await expectUnits(page, [today, today]);
        await page.getByRole("button", { name: "Weekly" }).click();
        await expectUnits(page, weekRange(now));
        await page.getByRole("button", { name: "Monthly" }).click();
        await expectUnits(page, monthRange(now.getFullYear(), now.getMonth() + 1));
    });

    test("monthly tab can move to the previous month", async ({ page }) => {
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await page.getByRole("button", { name: "Monthly" }).click();
        await page.getByTitle("Previous Month").click();
        await expectUnits(page, monthRange(previous.getFullYear(), previous.getMonth() + 1));
    });

    test("custom tab uses a date range, and picking a month afterwards switches to that month", async ({ page }) => {
        await page.getByRole("button", { name: "Custom" }).click();
        await expectUnits(page, monthRange(now.getFullYear(), now.getMonth() + 1));

        const from = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const dates = page.locator("input[type=date]");
        await dates.nth(0).fill(from);
        await dates.nth(1).fill(today);
        await expectUnits(page, [from, today]);

        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await page.getByTitle("Previous Month").click();
        await expectUnits(page, monthRange(previous.getFullYear(), previous.getMonth() + 1));
        await expect(dates.nth(0)).toHaveValue("");
    });

    test("ranks items and filters them by name", async ({ page }) => {
        const rows = page.locator("table").filter({ hasText: "Units Sold" }).locator("tbody tr");
        await expect(rows.first()).toContainText("Watalappan");
        await page.getByPlaceholder("Search item by name...").fill("yog");
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText("Yogurt");
    });
});
