import { createTestSchema } from "../helpers/test-db";

// Rebuilds the test database tables once before the E2E run
export default async function globalSetup() {
    await createTestSchema();
}
