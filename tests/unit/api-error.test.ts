import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { toErrorResponse } from "@/app/lib/api-error";

describe("toErrorResponse", () => {
    it("shows validation errors to the user as 400", () => {
        expect(toErrorResponse(new Error("Customer name is required."))).toEqual({ message: "Customer name is required.", status: 400 });
    });

    it("hides query failures (which contain SQL) behind a generic 500", () => {
        const error = new DrizzleQueryError("insert into `sales` ...", [1, 2], new Error("Data too long"));
        expect(toErrorResponse(error)).toEqual({ message: "A database error occurred. Please try again.", status: 500 });
    });

    it("hides driver/connection errors (which carry a code) behind a generic 500", () => {
        const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3306"), { code: "ECONNREFUSED" });
        expect(toErrorResponse(error).status).toBe(500);
        expect(toErrorResponse(error).message).not.toContain("127.0.0.1");
    });

    it("handles non-Error values", () => {
        expect(toErrorResponse("boom")).toEqual({ message: "Unknown error", status: 400 });
    });
});
