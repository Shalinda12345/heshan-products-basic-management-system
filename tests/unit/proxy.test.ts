import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import type { Role } from "@/app/lib/permissions";
import { BACKGROUND_REQUEST_HEADER } from "@/app/lib/background-request";
import { createSessionToken, readSessionToken, shouldRenewSession } from "@/app/lib/session";
import { config, proxy } from "@/proxy";

async function run(path: string, token?: string, init: { method?: string; headers?: Record<string, string> } = {}) {
    const headers = { host: "localhost:3000", ...init.headers, ...(token ? { cookie: `auth_token=${token}` } : {}) };
    return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { method: init.method ?? "GET", headers }));
}

const MINUTE = 60 * 1000;
const tokenFor = (role: Role, options: { minutesAgo?: number; mustChangePassword?: boolean } = {}) =>
    createSessionToken({ userId: 1, version: 1, role, mustChangePassword: options.mustChangePassword ?? false }, Date.now() - (options.minutesAgo ?? 0) * MINUTE);
const renewedCookie = (response: Response) => response.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];

const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";
const redirectTarget = (response: Response) => {
    const url = new URL(response.headers.get("location") ?? "", "http://x");
    return `${url.pathname}${url.search}`;
};

describe("proxy: signed out", () => {
    it.each(["/pages/sales", "/pages/sales/daily-sales", "/pages/expenses", "/pages/stock", "/admin/users", "/reports"])(
        "redirects page %s to /login, remembering where to come back to",
        async (path) => {
            const response = await run(path);
            expect(response.status).toBe(307);
            expect(redirectTarget(response)).toBe(`/login?next=${encodeURIComponent(path)}`);
        }
    );

    it("redirects the dashboard to a plain /login", async () => {
        expect(redirectTarget(await run("/"))).toBe("/login");
    });

    it.each(["/api/stock", "/api/sales/save-sales", "/api/dashboard/summary", "/api/expenses/save-return-expenses", "/api/users"])(
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
        expect((await run("/pages/stock", await tokenFor("admin", { minutesAgo: 120 }))).status).toBe(307);
    });
});

describe("proxy: signed in", () => {
    it.each(["/", "/pages/sales", "/pages/expenses/custom-expenses", "/reports", "/admin/users", "/admin/activity", "/api/stock", "/api/sales/save-sales"])(
        "lets an administrator through to %s",
        async (path) => {
            expect(passedThrough(await run(path, await tokenFor("admin")))).toBe(true);
        }
    );

    it.each([
        ["admin", "/"],
        ["owner", "/"],
        ["manager", "/"],
        ["staff", "/pages/sales"],
    ] as const)("sends a signed-in %s from the login page to %s", async (role, home) => {
        const response = await run("/login", await tokenFor(role));
        expect(response.status).toBe(307);
        expect(redirectTarget(response)).toBe(home);
    });
});

describe("proxy: what each role may open", () => {
    it.each([
        ["staff", "/pages/sales", true],
        ["staff", "/pages/sales/daily-sales", true],
        ["staff", "/pages/expenses", true],
        ["staff", "/pages/stock", true],
        ["staff", "/pages/expenses/monthly-expenses", false],
        ["staff", "/pages/expenses/returns", false],
        ["staff", "/reports", false],
        ["staff", "/admin/products", false],
        ["manager", "/reports/products", true],
        ["manager", "/admin/products", true],
        ["manager", "/pages/expenses/returns", true],
        ["manager", "/admin/activity", false],
        ["manager", "/admin/users", false],
        ["owner", "/admin/activity", true],
        ["owner", "/admin/users", false],
        ["admin", "/admin/users", true],
    ] as const)("%s → %s: %s", async (role, path, allowed) => {
        const response = await run(path, await tokenFor(role));
        if (allowed) {
            expect(passedThrough(response)).toBe(true);
        } else {
            expect(response.status).toBe(307);
            expect(redirectTarget(response)).toBe("/forbidden");
        }
    });

    it("sends staff from the dashboard address to their own start page instead of an error", async () => {
        const response = await run("/", await tokenFor("staff"));
        expect(redirectTarget(response)).toBe("/pages/sales");
    });

    it("leaves API permissions to the API routes (they check the database)", async () => {
        expect(passedThrough(await run("/api/users", await tokenFor("staff")))).toBe(true);
    });

    it.each(["/account", "/forbidden"])("lets every role open %s", async (path) => {
        expect(passedThrough(await run(path, await tokenFor("staff")))).toBe(true);
    });
});

describe("proxy: a new password is required", () => {
    const pending = () => tokenFor("admin", { mustChangePassword: true });

    it("sends every page to the account page", async () => {
        for (const path of ["/", "/pages/sales", "/admin/users"]) {
            const response = await run(path, await pending());
            expect(redirectTarget(response)).toBe("/account");
        }
    });

    it("refuses other API calls with 403", async () => {
        const response = await run("/api/stock", await pending());
        expect(response.status).toBe(403);
    });

    it.each(["/account", "/api/account/password", "/api/auth/check"])("still allows %s", async (path) => {
        expect(passedThrough(await run(path, await pending(), path.startsWith("/api/account") ? { method: "POST" } : {}))).toBe(true);
    });
});

describe("proxy: cross-site requests", () => {
    it("blocks a POST to the API from another site", async () => {
        const response = await run("/api/sales/save-sales", await tokenFor("admin"), { method: "POST", headers: { origin: "https://evil.example" } });
        expect(response.status).toBe(403);
    });

    it("allows a POST from this site", async () => {
        const response = await run("/api/sales/save-sales", await tokenFor("admin"), { method: "POST", headers: { origin: "http://localhost:3000" } });
        expect(passedThrough(response)).toBe(true);
    });

    it("uses the forwarded host behind a reverse proxy", async () => {
        const response = await run("/api/stock", await tokenFor("admin"), {
            method: "POST",
            headers: { origin: "https://shop.example.com", "x-forwarded-host": "shop.example.com", host: "127.0.0.1:3000" },
        });
        expect(passedThrough(response)).toBe(true);
    });

    it("does not block reads", async () => {
        const response = await run("/api/stock", await tokenFor("admin"), { headers: { origin: "https://evil.example" } });
        expect(passedThrough(response)).toBe(true);
    });
});

describe("proxy: sliding session", () => {
    it("leaves a fresh session alone", async () => {
        expect(renewedCookie(await run("/pages/sales", await tokenFor("admin", { minutesAgo: 5 })))).toBeUndefined();
    });

    it("renews a session past half its lifetime on user activity, keeping who it belongs to", async () => {
        const response = await run("/pages/sales", await tokenFor("manager", { minutesAgo: 40 }));
        expect(passedThrough(response)).toBe(true);
        const renewed = await readSessionToken(renewedCookie(response));
        expect(renewed).toMatchObject({ userId: 1, version: 1, role: "manager" });
        expect(shouldRenewSession(renewed!)).toBe(false);
        expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    });

    it("does not renew on the session poller", async () => {
        expect(renewedCookie(await run("/api/auth/check", await tokenFor("admin", { minutesAgo: 40 })))).toBeUndefined();
    });

    it("does not renew on background refreshes", async () => {
        const response = await run("/api/stock", await tokenFor("admin", { minutesAgo: 40 }), { headers: { [BACKGROUND_REQUEST_HEADER]: "1" } });
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
