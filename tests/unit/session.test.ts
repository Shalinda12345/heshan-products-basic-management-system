import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    createSessionToken,
    readSessionToken,
    shouldRenewSession,
    verifySessionToken,
    type SessionClaims,
} from "@/app/lib/session";

const claims: SessionClaims = { userId: 7, version: 3, role: "manager", mustChangePassword: false };

// AUTH_SECRET is "vitest-auth-secret" (vitest.config.mts)
function sign(body: Record<string, unknown>, secret = "vitest-auth-secret") {
    const payload = `v2.${Buffer.from(JSON.stringify(body)).toString("base64url")}`;
    return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

describe("session tokens", () => {
    it("uses the auth_token cookie with a one-hour lifetime", () => {
        expect(SESSION_COOKIE).toBe("auth_token");
        expect(SESSION_MAX_AGE_SECONDS).toBe(3600);
    });

    it("carries who signed in, their session version and role", async () => {
        const session = await readSessionToken(await createSessionToken(claims));
        expect(session).toMatchObject(claims);
        expect(await verifySessionToken(await createSessionToken(claims))).toBe(true);
    });

    it("carries a pending password change", async () => {
        const session = await readSessionToken(await createSessionToken({ ...claims, mustChangePassword: true }));
        expect(session?.mustChangePassword).toBe(true);
    });

    it("expires an hour after it was issued", async () => {
        const now = Date.now();
        const session = await readSessionToken(await createSessionToken(claims, now));
        expect(session?.expiresAt).toBe(now + SESSION_MAX_AGE_SECONDS * 1000);
    });

    it("rejects an expired token", async () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        expect(await readSessionToken(await createSessionToken(claims, twoHoursAgo))).toBeNull();
    });

    it("rejects tokens from before user accounts (the old constant cookie and v1 tokens)", async () => {
        expect(await verifySessionToken("logged_in")).toBe(false);
        const v1 = `v1.${Date.now() + 60_000}`;
        expect(await verifySessionToken(`${v1}.${createHmac("sha256", "vitest-auth-secret").update(v1).digest("base64url")}`)).toBe(false);
    });

    it.each([undefined, "", "v2", "v2.abc", "v2.%%%.abc", "v2.e30.abc", "a.b.c.d"])("rejects malformed token %j", async (token) => {
        expect(await readSessionToken(token)).toBeNull();
    });

    it("rejects a token signed with a different secret", async () => {
        const forged = sign({ uid: 1, ver: 1, role: "admin", pwc: 0, exp: Date.now() + 60_000 }, "someone-elses-secret");
        expect(await readSessionToken(forged)).toBeNull();
    });

    it("rejects a token whose claims were changed after signing (e.g. promoted to admin)", async () => {
        const [version, , signature] = (await createSessionToken({ ...claims, role: "staff" })).split(".");
        const tampered = Buffer.from(JSON.stringify({ uid: 7, ver: 3, role: "admin", pwc: 0, exp: Date.now() + 60_000 })).toString("base64url");
        expect(await readSessionToken([version, tampered, signature].join("."))).toBeNull();
    });

    it.each([
        ["an unknown role", { uid: 1, ver: 1, role: "superuser", pwc: 0 }],
        ["a missing user id", { ver: 1, role: "admin", pwc: 0 }],
        ["a fractional user id", { uid: 1.5, ver: 1, role: "admin", pwc: 0 }],
        ["a missing version", { uid: 1, role: "admin", pwc: 0 }],
    ])("rejects correctly signed claims with %s", async (_label, body) => {
        expect(await readSessionToken(sign({ ...body, exp: Date.now() + 60_000 }))).toBeNull();
    });

    it("accepts a correctly signed token produced elsewhere (stable format)", async () => {
        const session = await readSessionToken(sign({ uid: 2, ver: 5, role: "owner", pwc: 0, exp: Date.now() + 60_000 }));
        expect(session).toMatchObject({ userId: 2, version: 5, role: "owner", mustChangePassword: false });
    });

    it("renews only once less than half the lifetime is left", async () => {
        const now = Date.now();
        const fresh = (await readSessionToken(await createSessionToken(claims, now)))!;
        expect(shouldRenewSession(fresh, now + 10 * 60 * 1000)).toBe(false);
        expect(shouldRenewSession(fresh, now + 40 * 60 * 1000)).toBe(true);
    });
});
