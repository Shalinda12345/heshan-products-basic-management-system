import { describe, expect, it } from "vitest";
import { GET as listUsers, POST as createUser } from "@/app/api/users/route";
import { PATCH as updateUser } from "@/app/api/users/[id]/route";
import { POST as resetPassword } from "@/app/api/users/[id]/reset-password/route";
import { POST as signOut } from "@/app/api/users/[id]/sign-out/route";
import { signIn, updateUser as updateUserService } from "@/app/services/users";
import { get, patch, post } from "../helpers/http";
import { activityLog, query } from "../helpers/test-db";

const info = { ip: null, userAgent: null };
const userRow = async (id: number) =>
    (await query<{ username: string; name: string; role: string; is_active: number; must_change_password: number; session_version: number }>(
        "SELECT username, name, role, is_active, must_change_password, session_version FROM users WHERE id = ?", [id]
    ))[0];

describe("GET /api/users", () => {
    it("lists every account for an administrator, without password hashes", async () => {
        const { status, body } = await get(listUsers, "/api/users");
        expect(status).toBe(200);
        expect(body).toHaveLength(5);
        expect(body.find((u: { username: string }) => u.username === "former")).toMatchObject({ is_active: false, role: "staff" });
        expect(JSON.stringify(body)).not.toMatch(/scrypt|password_hash/);
    });

    it.each(["owner", "manager", "staff"] as const)("is refused to a %s", async (as) => {
        expect((await get(listUsers, "/api/users", { as })).status).toBe(403);
    });
});

describe("POST /api/users", () => {
    it("creates an account with a temporary password that must be changed at first sign-in", async () => {
        const { status, body } = await post(createUser, "/api/users", { username: " Nimal.P ", name: "Nimal Perera", role: "manager" });
        expect(status).toBe(201);
        expect(body.data).toMatchObject({ id: 6, username: "nimal.p" });
        expect(body.data.temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);
        expect(await userRow(6)).toMatchObject({ username: "nimal.p", role: "manager", is_active: 1, must_change_password: 1 });

        const signedIn = await signIn("nimal.p", body.data.temporaryPassword, info);
        expect(signedIn).toMatchObject({ ok: true, user: { mustChangePassword: true } });

        const [entry] = await activityLog();
        expect(entry).toMatchObject({ user_id: 1, action: "user.create", entity_type: "user", entity_id: "6" });
        expect(entry.summary).toBe('Created user "nimal.p" (Nimal Perera) as Manager');
        expect(JSON.stringify(entry.details)).not.toContain(body.data.temporaryPassword);
    });

    it.each([
        ["a taken username", { username: "OWNER", name: "X", role: "staff" }, 409, /already taken/],
        ["a short username", { username: "ab", name: "X", role: "staff" }, 400, /3 to 50/],
        ["spaces in the username", { username: "two words", name: "X", role: "staff" }, 400, /only contain/],
        ["no name", { username: "newbie", name: " ", role: "staff" }, 400, /Full name is required/],
        ["an unknown role", { username: "newbie", name: "X", role: "superuser" }, 400, /Choose a role/],
        ["a bad email", { username: "newbie", name: "X", role: "staff", email: "nope" }, 400, /valid email/],
        ["a weak chosen password", { username: "newbie", name: "X", role: "staff", password: "abc" }, 400, /at least 8/],
    ])("rejects %s", async (_label, input, status, message) => {
        const response = await post(createUser, "/api/users", input);
        expect(response.status).toBe(status);
        expect(response.body.message).toMatch(message);
        expect((await query("SELECT COUNT(*) AS n FROM users"))[0].n).toBe(5);
    });

    it("is refused to an owner", async () => {
        expect((await post(createUser, "/api/users", { username: "sneaky", name: "S", role: "admin" }, { as: "owner" })).status).toBe(403);
    });
});

describe("PATCH /api/users/:id", () => {
    const update = (id: number, body: Record<string, unknown>, as: "admin" = "admin") =>
        patch(updateUser, `/api/users/${id}`, body, { as, params: { id: String(id) } });

    it("changes a role and signs the user out so it applies at once", async () => {
        const { status, body } = await update(4, { role: "manager" });
        expect(status).toBe(200);
        expect(body.data).toEqual({ id: 4, changed: true });
        expect(await userRow(4)).toMatchObject({ role: "manager", session_version: 2 });
        const [entry] = await activityLog();
        expect(entry.summary).toBe('Updated user "staff": role Staff → Manager');
        expect(entry.details).toEqual({ changes: { role: { from: "staff", to: "manager" } } });
    });

    it("renames without signing the user out", async () => {
        await update(4, { name: "Saman Kumara" });
        expect(await userRow(4)).toMatchObject({ name: "Saman Kumara", session_version: 1 });
    });

    it("disables and re-enables an account", async () => {
        await update(4, { is_active: false });
        expect(await userRow(4)).toMatchObject({ is_active: 0, session_version: 2 });
        await update(4, { is_active: true });
        expect((await userRow(4)).is_active).toBe(1);
        expect((await activityLog()).map((e) => e.summary)).toEqual(['Updated user "staff": disabled', 'Updated user "staff": enabled']);
    });

    it("records nothing when nothing changes", async () => {
        const { body } = await update(4, { name: "Saman Staff", role: "staff" });
        expect(body.data.changed).toBe(false);
        expect(await activityLog()).toEqual([]);
    });

    it("won't let administrators lock themselves out", async () => {
        expect((await update(1, { is_active: false })).body.message).toBe("You cannot disable your own account.");
        expect((await update(1, { role: "staff" })).body.message).toBe("You cannot change your own role.");
    });

    it("lets an administrator demote another administrator", async () => {
        await query("INSERT INTO users (id, username, name, role, password_hash) VALUES (9, 'second', 'Second Admin', 'admin', 'x')");
        expect((await update(9, { role: "manager" })).status).toBe(200);
        expect((await userRow(9)).role).toBe("manager");
    });

    it("never leaves the system without an active administrator", async () => {
        // Through the API an administrator can't demote themselves, so check the rule in the service itself
        // (it also guards two administrators demoting each other at the same moment)
        const owner = { id: 2, username: "owner" };
        await expect(updateUserService(owner, 1, { role: "staff" }, info)).rejects.toThrow(/only active administrator/);
        await expect(updateUserService(owner, 1, { is_active: false }, info)).rejects.toThrow(/only active administrator/);
        expect(await userRow(1)).toMatchObject({ role: "admin", is_active: 1 });
    });

    it("answers 404 for an unknown user", async () => {
        expect((await update(99, { name: "Ghost" })).status).toBe(404);
    });
});

describe("password resets and sign-outs", () => {
    it("issues a new temporary password, unlocks the account and signs the user out", async () => {
        await query("UPDATE users SET failed_login_attempts = 3, locked_until = '2030-01-01 00:00:00' WHERE id = 4");
        const { status, body } = await post(resetPassword, "/api/users/4/reset-password", {}, { params: { id: "4" } });
        expect(status).toBe(200);
        expect(await userRow(4)).toMatchObject({ must_change_password: 1, session_version: 2 });
        expect((await signIn("staff", body.data.temporaryPassword, info)).ok).toBe(true);
        expect((await activityLog()).map((e) => e.action)).toEqual(["user.password_reset", "auth.login"]);
    });

    it("signs a user out of every device", async () => {
        const { status } = await post(signOut, "/api/users/3/sign-out", {}, { params: { id: "3" } });
        expect(status).toBe(200);
        expect((await userRow(3)).session_version).toBe(2);
    });

    it("are refused to non-administrators", async () => {
        expect((await post(resetPassword, "/api/users/4/reset-password", {}, { params: { id: "4" }, as: "owner" })).status).toBe(403);
    });

    it("won't reset an administrator's own password (it would sign them out before they could note it)", async () => {
        const { status, body } = await post(resetPassword, "/api/users/1/reset-password", {}, { params: { id: "1" } });
        expect(status).toBe(400);
        expect(body.message).toBe("To change your own password, use My account.");
    });
});
