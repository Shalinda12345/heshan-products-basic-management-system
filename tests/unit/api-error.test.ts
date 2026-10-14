import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
    DATABASE_OUTDATED_MESSAGE,
    DATABASE_UNAVAILABLE_MESSAGE,
    toErrorResponse,
    toReadErrorResponse,
} from "@/app/lib/api-error";

// Errors as the mysql2 driver raises them: a message plus a string `code`
const driverError = (code: string, message = `${code}: details`) => Object.assign(new Error(message), { code });
// Query failures reach the routes wrapped by Drizzle, with the driver error as the cause
const queryError = (code: string) => new DrizzleQueryError("insert into `expenses` ...", [1, 2], driverError(code));

describe("toErrorResponse", () => {
    it("shows validation errors to the user as 400", () => {
        expect(toErrorResponse(new Error("Customer name is required."))).toEqual({ message: "Customer name is required.", status: 400 });
    });

    it("hides query failures (which contain SQL) behind a generic 500", () => {
        const error = new DrizzleQueryError("insert into `sales` ...", [1, 2], new Error("Data too long"));
        expect(toErrorResponse(error)).toEqual({ message: "A database error occurred. Please try again.", status: 500 });
    });

    it("hides other driver errors (which carry a code) behind a generic 500", () => {
        expect(toErrorResponse(queryError("ER_DATA_TOO_LONG"))).toEqual({ message: "A database error occurred. Please try again.", status: 500 });
        expect(toErrorResponse(driverError("ER_LOCK_DEADLOCK"))).toEqual({ message: "A database error occurred. Please try again.", status: 500 });
    });

    it("says the database can't be reached when the server is down, without leaking its address", () => {
        // Starting a transaction raises the pool's error directly; a plain query raises it wrapped by Drizzle
        const direct = driverError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:3306");
        for (const error of [direct, queryError("ECONNREFUSED")]) {
            expect(toErrorResponse(error)).toEqual({ message: DATABASE_UNAVAILABLE_MESSAGE, status: 503 });
        }
        expect(toErrorResponse(direct).message).not.toContain("127.0.0.1");
    });

    it.each(["ENOTFOUND", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"])(
        "treats %s as the database being unavailable",
        (code) => {
            expect(toErrorResponse(queryError(code))).toEqual({ message: DATABASE_UNAVAILABLE_MESSAGE, status: 503 });
        }
    );

    it.each(["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE"])("asks for the migration when a column or table is missing (%s)", (code) => {
        expect(toErrorResponse(queryError(code))).toEqual({ message: DATABASE_OUTDATED_MESSAGE, status: 500 });
    });

    it("handles non-Error values", () => {
        expect(toErrorResponse("boom")).toEqual({ message: "Unknown error", status: 400 });
    });
});

describe("toReadErrorResponse", () => {
    it("explains an unreachable or out-of-date database", () => {
        expect(toReadErrorResponse(queryError("ECONNREFUSED"))).toEqual({ message: DATABASE_UNAVAILABLE_MESSAGE, status: 503 });
        expect(toReadErrorResponse(queryError("ER_NO_SUCH_TABLE"))).toEqual({ message: DATABASE_OUTDATED_MESSAGE, status: 500 });
    });

    it("never shows other errors' messages, since a failed read is a server fault", () => {
        expect(toReadErrorResponse(new TypeError("Cannot read properties of undefined"))).toEqual({ message: "Internal Server Error", status: 500 });
        expect(toReadErrorResponse(queryError("ER_PARSE_ERROR"))).toEqual({ message: "Internal Server Error", status: 500 });
    });
});
