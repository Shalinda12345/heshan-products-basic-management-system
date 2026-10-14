import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { BACKGROUND_REQUEST_HEADER, createSessionToken, shouldRenewSession, verifySessionToken } from "@/app/lib/session";
import { config, proxy } from "@/proxy";

async function run(path: string, token?: string, extraHeaders: Record<string, string> = {}) {
    const headers = { ...extraHeaders, ...(token ? { cookie: `auth_token=${token}` } : {}) };
    return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { headers }));
}

const MINUTE = 60 * 1000;
// A session created `minutesAgo` minutes ago (sessions last 60 minutes)
const sessionFrom = (minutesAgo: number) => createSessionToken(Date.now() - minutesAgo * MINUTE);
const renewedCookie = (response: Response) => response.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];

const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";
const redirectTarget = (response: Response) => new URL(response.headers.get("location") ?? "", "http://x").pathname;

describe("proxy: signed out", () => {
    it.each(["/", "/pages/sales", "/pages/sales/daily-sales", "/pages/expenses", "/pages/stock"])("redirects page %s to /login", async (path) => {
        const response = await run(path);
        expect(response.status).toBe(307);
        expect(redirectTarget(response)).toBe("/login");
    });

    it.each(["/api/stock", "/api/sales/save-sales", "/api/dashboard/summary", "/api/expenses/save-return-expenses"])(
        "answers API %s with 401 JSON",
        async (path) => {
            const response = await run(path);
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ error: "Unauthorized" });
        }
    );

    it("lets the login page through", async () => {
        expect(passedThrough(await run("/login"))).toBe(true);
    });

    it("lets the session check endpoint through", async () => {
        expect(passedThrough(await run("/api/auth/check"))).toBe(true);
    });

    it("treats a forged cookie as signed out", async () => {
        expect((await run("/pages/sales", "logged_in")).status).toBe(307);
        expect((await run("/api/stock", "anything")).status).toBe(401);
    });

    it("treats an expired session as signed out", async () => {
        const expired = await createSessionToken(Date.now() - 2 * 60 * 60 * 1000);
        expect((await run("/pages/stock", expired)).status).toBe(307);
    });
});

describe("proxy: signed in", () => {
    it.each(["/", "/pages/sales", "/pages/expenses/custom-expenses", "/api/stock", "/api/sales/save-sales"])("lets %s through", async (path) => {
        expect(passedThrough(await run(path, await createSessionToken()))).toBe(true);
    });

    it("sends the login page back to the dashboard", async () => {
        const response = await run("/login", await createSessionToken());
        expect(response.status).toBe(307);
        expect(redirectTarget(response)).toBe("/");
    });
});

describe("proxy: sliding session", () => {
    it("leaves a fresh session alone", async () => {
        expect(renewedCookie(await run("/pages/sales", await sessionFrom(5)))).toBeUndefined();
    });

    it("renews a session past half its lifetime on user activity", async () => {
        const response = await run("/pages/sales", await sessionFrom(40));
        expect(passedThrough(response)).toBe(true);
        const renewed = renewedCookie(response);
        expect(await verifySessionToken(renewed)).toBe(true);
        expect(shouldRenewSession(renewed)).toBe(false);
        expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    });

    it("does not renew on the session poller", async () => {
        expect(renewedCookie(await run("/api/auth/check", await sessionFrom(40)))).toBeUndefined();
    });

    it("does not renew on background refreshes", async () => {
        const response = await run("/api/stock", await sessionFrom(40), { [BACKGROUND_REQUEST_HEADER]: "1" });
        expect(passedThrough(response)).toBe(true);
        expect(renewedCookie(response)).toBeUndefined();
    });
});

describe("proxy matcher", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    it.each(["/", "/login", "/pages/sales", "/api/stock", "/api/auth/check"])("runs on %s", (path) => {
        expect(matcher.test(path)).toBe(true);
    });

    it.each(["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/logo/heshan_logo_transparent.png", "/next.svg"])(
        "skips static asset %s",
        (path) => {
            expect(matcher.test(path)).toBe(false);
        }
    );
});
