import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, passwordProblem, verifyPassword } from "@/app/lib/password";

describe("password hashing", () => {
    it("verifies the right password and rejects others", async () => {
        const hash = await hashPassword("Coconut-2026");
        expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
        expect(await verifyPassword("Coconut-2026", hash)).toBe(true);
        expect(await verifyPassword("coconut-2026", hash)).toBe(false);
        expect(await verifyPassword("", hash)).toBe(false);
    });

    it("salts every hash, so equal passwords look different", async () => {
        expect(await hashPassword("same-pass1")).not.toBe(await hashPassword("same-pass1"));
    });

    it.each([null, undefined, "", "plain-text", "scrypt$1$2$3"])("rejects a missing or malformed stored hash %j", async (stored) => {
        expect(await verifyPassword("anything1", stored)).toBe(false);
    });
});

describe("password rules", () => {
    it.each([
        ["short1", /at least 8/],
        ["onlyletters", /letters and numbers/],
        ["12345678", /letters and numbers/],
        ["kamal2026x", /must not contain the username/],
    ])("rejects %j", (password, message) => {
        expect(passwordProblem(password, "kamal")).toMatch(message);
    });

    it("accepts a reasonable password", () => {
        expect(passwordProblem("Watalappan42", "kamal")).toBeNull();
    });

    it("generates temporary passwords that meet the rules and avoid look-alike characters", () => {
        for (let i = 0; i < 50; i++) {
            const password = generateTemporaryPassword();
            expect(password).toHaveLength(12);
            expect(passwordProblem(password)).toBeNull();
            expect(password).not.toMatch(/[01lIoO]/);
        }
    });
});
