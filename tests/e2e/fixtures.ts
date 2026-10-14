import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { SESSION_COOKIE, createSessionToken } from "@/app/lib/session";
import { resetDatabase } from "../helpers/test-db";

export { expect };
export type { Locator, Page };

// Every test starts from freshly seeded data (an automatic fixture, so it runs before any beforeEach hook).
// Tests are signed in unless they opt out with test.use({ signedIn: false }).
// Fixture callbacks are named runTest rather than use, so the React Hooks lint rule does not misfire.
export const test = base.extend<{ signedIn: boolean; freshDatabase: void }>({
    signedIn: [true, { option: true }],
    freshDatabase: [
        // Playwright requires the object pattern even when a fixture has no dependencies
        async ({}, runTest) => {
            await resetDatabase(new Date());
            await runTest();
        },
        { auto: true },
    ],
    page: async ({ page, context, baseURL, signedIn }, runTest) => {
        if (signedIn) {
            await context.addCookies([{ name: SESSION_COOKIE, value: await createSessionToken(), url: baseURL! }]);
        }
        await runTest(page);
    },
});

// Most form labels are not linked to their inputs, so find the control right after the label
export function field(scope: Page | Locator, label: string): Locator {
    return scope.locator(`label:text-is("${label}") + input, label:text-is("${label}") + select`);
}

// Selects the first option whose text contains `text` (options often carry extra info, e.g. stock levels)
export async function selectOptionContaining(select: Locator, text: string) {
    const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
    if (value === null) throw new Error(`No option containing "${text}"`);
    await select.selectOption(value);
}

export function alertDialog(page: Page): Locator {
    return page.getByRole("dialog");
}

// Waits for the app's alert dialog with the given title, checks the message, then dismisses it
export async function expectAlert(page: Page, title: string, message?: string | RegExp) {
    const dialog = alertDialog(page);
    await expect(dialog.locator("#alert-title")).toHaveText(title);
    if (message) await expect(dialog.locator("p")).toContainText(message);
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).toHaveCount(0);
}

// Formats an amount the way the pages do in the en-US locale (e.g. 4,380.00)
export function money(amount: number): string {
    return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
