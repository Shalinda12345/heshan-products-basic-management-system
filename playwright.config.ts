import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./tests/helpers/test-db";

const PORT = 3210;
const AUTH_SECRET = "playwright-auth-secret";

// The test process signs session cookies with the same secret as the server it starts,
// and uses the same business time zone when seeding dates relative to "today".
process.env.AUTH_SECRET = AUTH_SECRET;
process.env.TZ = "Asia/Colombo";

export default defineConfig({
    testDir: "tests/e2e",
    // Every test re-seeds the one shared test database, so run tests one at a time
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    reporter: [["list"], ["html", { open: "never" }]],
    globalSetup: "./tests/e2e/global-setup.ts",
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // Uses the installed Microsoft Edge: no Playwright browser download needed
        channel: "msedge",
        locale: "en-US",
        timezoneId: "Asia/Colombo",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    // Tests run against a production build, served on its own port against the test database
    webServer: {
        command: `npx next build && npx next start -p ${PORT} -H 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}/login`,
        timeout: 300_000,
        reuseExistingServer: false,
        env: { DATABASE_URL: testDatabaseUrl(), AUTH_SECRET, TZ: "Asia/Colombo" },
    },
});
