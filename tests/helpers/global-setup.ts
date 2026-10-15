import { createTestSchema } from "./test-db";

// Runs once before the API tests and before the E2E tests: (re)creates every table in the test database
export default async function globalSetup() {
    await createTestSchema();
}
