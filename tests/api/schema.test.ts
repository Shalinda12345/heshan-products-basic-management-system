import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { query } from "../helpers/test-db";

// Guards against tests/helpers/test-db.ts drifting away from app/db/schema.ts
describe("test database schema", () => {
    const tables = (Object.values(schema) as MySqlTable[]).map((table) => getTableConfig(table));

    it.each(tables.map((config) => [config.name, config] as const))("table %s matches app/db/schema.ts", async (name, config) => {
        const columns = await query<{ Field: string; Null: string }>(`SHOW COLUMNS FROM \`${name}\``);
        const actual = columns.map((c) => [c.Field, c.Null === "NO"]).sort();
        const expected = config.columns.map((c) => [c.name, c.notNull]).sort();
        expect(actual).toEqual(expected);
    });
});
