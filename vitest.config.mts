import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ path: ".env.test.local", quiet: true });

export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    },
    test: {
        environment: "node",
        env: {
            // Route handlers import app/db, which connects to DATABASE_URL: point it at the test database
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
            AUTH_SECRET: "vitest-auth-secret",
            // Reports bucket dates in the server's local time zone; pin the business time zone
            TZ: "Asia/Colombo",
        },
        projects: [
            {
                extends: true,
                test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
            },
            {
                extends: true,
                test: {
                    name: "api",
                    include: ["tests/api/**/*.test.ts"],
                    globalSetup: ["tests/helpers/global-setup.ts"],
                    setupFiles: ["tests/helpers/api-setup.ts"],
                    // All API tests share one database, so run test files one at a time
                    fileParallelism: false,
                },
            },
        ],
    },
});
