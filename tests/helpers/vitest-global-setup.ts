import { createTestSchema } from "./test-db";

// Runs once before the API test files: (re)creates every table in the test database
export default async function setup() {
    await createTestSchema();
}
