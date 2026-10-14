import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "@/app/lib/session";

// AUTH_SECRET is "vitest-auth-secret" (vitest.config.mts)
function sign(payload: string, secret = "vitest-auth-secret") {
    return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

describe("session tokens", () => {
    it("uses the auth_token cookie with a one-hour lifetime", () => {
        expect(SESSION_COOKIE).toBe("auth_token");
        expect(SESSION_MAX_AGE_SECONDS).toBe(3600);
    });

    it("accepts a freshly created token", async () => {
        expect(await verifySessionToken(await createSessionToken())).toBe(true);
    });

    it("embeds the expiry time in the token", async () => {
        const now = Date.now();
        const [version, expiresAt] = (await createSessionToken(now)).split(".");
        expect(version).toBe("v1");
        expect(Number(expiresAt)).toBe(now + SESSION_MAX_AGE_SECONDS * 1000);
    });

    it("rejects an expired token", async () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        expect(await verifySessionToken(await createSessionToken(twoHoursAgo))).toBe(false);
    });

    it("rejects the old constant cookie value", async () => {
        expect(await verifySessionToken("logged_in")).toBe(false);
    });

    it.each([undefined, "", "v1", "v1.123", "v2.9999999999999.abc", "v1.not-a-number.abc", "v1.9999999999999.%%%", "a.b.c.d"])(
        "rejects malformed token %j",
        async (token) => {
            expect(await verifySessionToken(token)).toBe(false);
        }
    );

    it("rejects a token signed with a different secret", async () => {
        expect(await verifySessionToken(sign(`v1.${Date.now() + 60_000}`, "someone-elses-secret"))).toBe(false);
    });

    it("rejects a token whose expiry was extended after signing", async () => {
        const [version, expiresAt, signature] = (await createSessionToken()).split(".");
        expect(await verifySessionToken([version, Number(expiresAt) + 86_400_000, signature].join("."))).toBe(false);
    });

    it("accepts a correctly signed token produced elsewhere (stable format)", async () => {
        expect(await verifySessionToken(sign(`v1.${Date.now() + 60_000}`))).toBe(true);
    });
});
