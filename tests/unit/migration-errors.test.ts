import { describe, expect, it } from "vitest";
import { explainConnectionError } from "@/app/db/migrations";

const url = "mysql://root:secret@localhost:3306/shop";
const fail = (code: string) => Object.assign(new Error("boom"), { code });

describe("command-line database errors", () => {
    it("says the server isn't running, without showing the password", () => {
        const message = explainConnectionError(fail("ECONNREFUSED"), url);
        expect(message).toMatch(/Cannot connect to the database server at localhost:3306/);
        expect(message).toMatch(/XAMPP Control Panel/);
        expect(message).not.toContain("secret");
    });

    it.each([
        ["ENOTFOUND", /Cannot reach the database server at localhost:3306/],
        ["ER_ACCESS_DENIED_ERROR", /refused the username or password/],
        ["ER_BAD_DB_ERROR", /database "shop" does not exist/],
    ])("explains %s", (code, expected) => {
        expect(explainConnectionError(fail(code), url)).toMatch(expected);
    });

    it("leaves other errors to the normal error output", () => {
        expect(explainConnectionError(fail("ER_PARSE_ERROR"), url)).toBeNull();
        expect(explainConnectionError(new Error("plain"), url)).toBeNull();
    });
});
