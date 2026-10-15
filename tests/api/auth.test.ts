import { describe, expect, it, vi } from "vitest";
import { GET as authCheck } from "@/app/api/auth/check/route";
import { POST as changePassword } from "@/app/api/account/password/route";
import { GET as stockList } from "@/app/api/stock/route";
import { landingPath, type CurrentUser } from "@/app/lib/auth";
import { createSessionToken, readSessionToken } from "@/app/lib/session";
import { LOCKOUT_MINUTES, MAX_FAILED_LOGINS, signIn } from "@/app/services/users";
import { TODAY } from "../helpers/clock";
import { call, get, post } from "../helpers/http";
import { TEST_PASSWORD, TEST_USERS, activityLog, query } from "../helpers/test-db";

const info = { ip: "203.0.113.7", userAgent: "vitest" };

describe("signing in", () => {
    it("accepts the right password, whatever the username's case", async () => {
        const result = await signIn("  MANAGER ", TEST_PASSWORD, info);
        expect(result).toMatchObject({ ok: true, user: { id: 3, username: "manager", role: "manager", mustChangePassword: false } });
        const [row] = await query<{ last_login_at: string | null; failed_login_attempts: number }>("SELECT last_login_at, failed_login_attempts FROM users WHERE id = 3");
        expect(row.last_login_at).not.toBeNull();
        expect(row.failed_login_attempts).toBe(0);
    });

    it("logs the sign-in with where it came from", async () => {
        await signIn("owner", TEST_PASSWORD, info);
        const [entry] = await query("SELECT user_id, username, action, ip_address, user_agent FROM activity_log");
        expect(entry).toEqual({ user_id: 2, username: "owner", action: "auth.login", ip_address: "203.0.113.7", user_agent: "vitest" });
    });

    it.each([
        ["a wrong password", "admin", "wrong-pass1"],
        ["an unknown username", "nobody", TEST_PASSWORD],
    ])("gives the same answer for %s, and logs the attempt", async (_label, username, password) => {
        expect(await signIn(username, password, info)).toEqual({ ok: false, message: "Invalid username or password." });
        expect((await activityLog()).map((e) => [e.username, e.action])).toEqual([[username, "auth.login_failed"]]);
    });

    it("requires both fields", async () => {
        expect(await signIn("", "", info)).toEqual({ ok: false, message: "Username and password are required." });
    });

    it("refuses a disabled account, but only tells someone who knows the password", async () => {
        expect(await signIn("former", "wrong-pass1", info)).toEqual({ ok: false, message: "Invalid username or password." });
        expect(await signIn("former", TEST_PASSWORD, info)).toEqual({
            ok: false, message: "This account has been disabled. Ask an administrator to enable it.",
        });
    });

    it(`locks the account for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_LOGINS} wrong passwords`, async () => {
        for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
            expect((await signIn("staff", `wrong-${i}x`, info)).ok).toBe(false);
        }
        expect(await signIn("staff", "wrong-5x", info)).toEqual({ ok: false, message: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.` });
        // Even the right password is refused while locked
        expect(await signIn("staff", TEST_PASSWORD, info)).toMatchObject({ ok: false, message: /Too many failed attempts/ });
    });

    it("lets the user in again once the lock has expired", async () => {
        for (let i = 0; i < MAX_FAILED_LOGINS; i++) await signIn("staff", "wrong-pass1", info);
        vi.setSystemTime(Date.now() + (LOCKOUT_MINUTES + 1) * 60 * 1000);
        try {
            expect((await signIn("staff", TEST_PASSWORD, info)).ok).toBe(true);
        } finally {
            vi.setSystemTime(TODAY);
        }
    });

    it("resets the failure count after a successful sign-in", async () => {
        await signIn("staff", "wrong-pass1", info);
        await signIn("staff", "wrong-pass1", info);
        await signIn("staff", TEST_PASSWORD, info);
        const [row] = await query<{ failed_login_attempts: number }>("SELECT failed_login_attempts FROM users WHERE id = 4");
        expect(row.failed_login_attempts).toBe(0);
    });
});

describe("where sign-in leads", () => {
    const user = (role: CurrentUser["role"]): CurrentUser => ({ id: 1, username: "u", name: "U", email: null, role, mustChangePassword: false, sessionVersion: 1 });

    it("goes back to the page that was asked for", () => {
        expect(landingPath(user("manager"), "/pages/sales/invoices?status=void")).toBe("/pages/sales/invoices?status=void");
    });

    it.each(["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "/login", "/api/stock"])(
        "never leaves the site or lands on %j",
        (requested) => {
            expect(landingPath(user("admin"), requested)).toBe("/");
        }
    );

    it("checks the page the browser would really open", () => {
        expect(landingPath(user("staff"), "/pages/sales/../../admin/users")).toBe("/pages/sales");
    });
});

describe("API sessions are checked against the database", () => {
    it("refuses requests without a session", async () => {
        const { status, body } = await get(stockList, "/api/stock", { as: null });
        expect(status).toBe(401);
        expect(body.error).toMatch(/session has ended/);
    });

    it("ends the sessions of a user who has been disabled", async () => {
        await query("UPDATE users SET is_active = 0 WHERE id = 3");
        expect((await get(stockList, "/api/stock", { as: "manager" })).status).toBe(401);
    });

    it("ends sessions issued before the user's session version changed (password reset, sign out everywhere)", async () => {
        await query("UPDATE users SET session_version = 2 WHERE id = 3");
        expect((await get(stockList, "/api/stock", { as: "manager" })).status).toBe(401);
    });

    it("answers 403 when the role lacks the permission", async () => {
        const { status, body } = await get((await import("@/app/api/users/route")).GET, "/api/users", { as: "manager" });
        expect(status).toBe(403);
        expect(body.error).toBe("You do not have permission to do this.");
    });

    it("only lets a user with a pending password change reach the password form", async () => {
        await query("UPDATE users SET must_change_password = 1 WHERE id = 1");
        const token = await createSessionToken({ userId: 1, version: 1, role: "admin", mustChangePassword: true });
        const { status } = await call(stockList, "/api/stock", { headers: { cookie: `auth_token=${token}` } }, { as: null });
        expect(status).toBe(403);
    });
});

describe("a malformed session cookie", () => {
    it("counts as signed out rather than a server error", async () => {
        const response = await call(stockList, "/api/stock", { headers: { cookie: "auth_token=%E0%A4%A" } }, { as: null });
        expect(response.status).toBe(401);
    });
});

describe("GET /api/auth/check", () => {
    it("reports a valid session", async () => {
        expect((await get(authCheck, "/api/auth/check")).body).toEqual({ authenticated: true });
    });

    it("reports no session without clearing anything", async () => {
        const response = await get(authCheck, "/api/auth/check", { as: null });
        expect(response.body).toEqual({ authenticated: false });
        expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("clears the cookie of a session that is no longer valid", async () => {
        await query("UPDATE users SET is_active = 0 WHERE id = 4");
        const response = await get(authCheck, "/api/auth/check", { as: "staff" });
        expect(response.body).toEqual({ authenticated: false });
        expect(response.headers.get("set-cookie")).toMatch(/auth_token=;/);
    });
});

describe("POST /api/account/password", () => {
    const change = (body: Record<string, unknown>, as: "admin" | "staff" = "staff") =>
        post(changePassword, "/api/account/password", body, { as });

    it("changes the password, signs out other devices and keeps this browser signed in", async () => {
        const { status, headers } = await change({ current_password: TEST_PASSWORD, new_password: "Fresh-start-42" });
        expect(status).toBe(200);
        const [row] = await query<{ session_version: number; must_change_password: number }>("SELECT session_version, must_change_password FROM users WHERE id = 4");
        expect(row).toEqual({ session_version: 2, must_change_password: 0 });

        const newToken = headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];
        expect(await readSessionToken(newToken)).toMatchObject({ userId: 4, version: 2, mustChangePassword: false });
        // The old session (version 1) no longer works
        expect((await get(stockList, "/api/stock", { as: "staff" })).status).toBe(401);
        expect((await signIn("staff", "Fresh-start-42", info)).ok).toBe(true);

        expect((await activityLog()).map((e) => e.action)).toContain("auth.password_changed");
    });

    it("clears a pending password change", async () => {
        await query("UPDATE users SET must_change_password = 1 WHERE id = 4");
        const token = await createSessionToken({ userId: 4, version: 1, role: "staff", mustChangePassword: true });
        const { status, headers } = await call(changePassword, "/api/account/password", {
            method: "POST",
            headers: { cookie: `auth_token=${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ current_password: TEST_PASSWORD, new_password: "Brand-new-77" }),
        }, { as: null });
        expect(status).toBe(200);
        const renewed = await readSessionToken(headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1]);
        expect(renewed?.mustChangePassword).toBe(false);
    });

    it.each([
        ["a wrong current password", { current_password: "nope-nope1", new_password: "Brand-new-77" }, "Your current password is not correct."],
        ["a weak new password", { current_password: TEST_PASSWORD, new_password: "short" }, /at least 8/],
        ["the same password again", { current_password: TEST_PASSWORD, new_password: TEST_PASSWORD }, /must be different/],
        ["the username inside", { current_password: TEST_PASSWORD, new_password: "staff-12345" }, /username/],
    ])("rejects %s", async (_label, body, message) => {
        const { status, body: result } = await change(body);
        expect(status).toBe(400);
        expect(result.message).toMatch(message);
        const [row] = await query<{ session_version: number }>("SELECT session_version FROM users WHERE id = 4");
        expect(row.session_version).toBe(1);
    });
});

describe("seeded test users", () => {
    it("match TEST_USERS", async () => {
        const rows = await query<{ id: number; username: string; role: string }>("SELECT id, username, role FROM users ORDER BY id");
        expect(rows).toEqual(Object.values(TEST_USERS).map(({ id, username, role }) => ({ id, username, role })));
    });
});
