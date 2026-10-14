import { afterAll, beforeEach, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { TODAY } from "./clock";
import { resetDatabase } from "./test-db";

// Only Date is faked: real timers keep the MySQL driver working
vi.useFakeTimers({ toFake: ["Date"], now: TODAY });

beforeEach(async () => {
    await resetDatabase(TODAY);
});

// app/db keeps its connection pool on globalThis; close it so the next test file starts clean
afterAll(async () => {
    const holder = globalThis as { conn?: Pool };
    await holder.conn?.end();
    delete holder.conn;
});
