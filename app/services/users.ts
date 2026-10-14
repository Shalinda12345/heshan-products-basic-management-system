import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { users } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { generateTemporaryPassword, hashPassword, passwordProblem, verifyPassword } from "../lib/password";
import { ROLE_INFO, isRole, type Role } from "../lib/permissions";
import type { CurrentUser } from "../lib/auth";
import { changedFields, logActivity, type Actor, type RequestInfo } from "./activity";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

const INVALID_LOGIN = "Invalid username or password.";

export function normaliseUsername(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function usernameProblem(username: string): string | null {
    if (username.length < 3 || username.length > 50) return "Username must be 3 to 50 characters long.";
    if (!/^[a-z0-9._-]+$/.test(username)) return "Username may only contain letters, numbers, dots, dashes and underscores.";
    return null;
}

function cleanEmail(value: unknown): string | null {
    const email = String(value ?? "").trim();
    if (!email) return null;
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("Enter a valid email address, or leave it blank.");
    return email;
}

function cleanName(value: unknown): string {
    const name = String(value ?? "").trim();
    if (!name) throw new RequestError("Full name is required.");
    if (name.length > 255) throw new RequestError("Full name is too long.");
    return name;
}

function toCurrentUser(row: typeof users.$inferSelect): CurrentUser {
    return {
        id: Number(row.id),
        username: row.username,
        name: row.name,
        email: row.email,
        role: isRole(row.role) ? row.role : "staff",
        mustChangePassword: row.must_change_password,
        sessionVersion: row.session_version,
    };
}

// ─── Signing in ───────────────────────────────────────────────────────────────

export type SignInResult = { ok: true; user: CurrentUser } | { ok: false; message: string };

export async function signIn(usernameInput: unknown, password: unknown, info: RequestInfo): Promise<SignInResult> {
    const username = normaliseUsername(usernameInput);
    const secret = typeof password === "string" ? password : "";
    if (!username || !secret) return { ok: false, message: "Username and password are required." };

    const [row] = await db.select().from(users).where(eq(users.username, username));
    const now = new Date();

    const fail = async (actorId: number | null, reason: string, message = INVALID_LOGIN): Promise<SignInResult> => {
        await logActivity(db, { id: actorId, username }, {
            action: "auth.login_failed",
            summary: `Failed sign-in as "${username}": ${reason}`,
            entityType: actorId ? "user" : undefined,
            entityId: actorId,
            details: { reason },
        }, info);
        return { ok: false, message };
    };

    if (!row) {
        await verifyPassword(secret, null); // same time as a real check
        return fail(null, "unknown username");
    }

    if (row.locked_until && row.locked_until.getTime() > now.getTime()) {
        const minutes = Math.ceil((row.locked_until.getTime() - now.getTime()) / 60000);
        return fail(row.id, "account locked", `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }

    if (!(await verifyPassword(secret, row.password_hash))) {
        const attempts = row.failed_login_attempts + 1;
        const lock = attempts >= MAX_FAILED_LOGINS;
        await db.update(users)
            .set({
                failed_login_attempts: lock ? 0 : attempts,
                locked_until: lock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000) : null,
            })
            .where(eq(users.id, row.id));
        return lock
            ? fail(row.id, `wrong password (${attempts} attempts), locked for ${LOCKOUT_MINUTES} minutes`,
                `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`)
            : fail(row.id, `wrong password (attempt ${attempts} of ${MAX_FAILED_LOGINS})`);
    }

    if (!row.is_active) {
        return fail(row.id, "account disabled", "This account has been disabled. Ask an administrator to enable it.");
    }

    await db.transaction(async (tx) => {
        await tx.update(users)
            .set({ failed_login_attempts: 0, locked_until: null, last_login_at: now })
            .where(eq(users.id, row.id));
        await logActivity(tx, { id: row.id, username }, {
            action: "auth.login",
            summary: `${row.name} signed in`,
            entityType: "user",
            entityId: row.id,
        }, info);
    });
    return { ok: true, user: toCurrentUser(row) };
}

// ─── Own account ──────────────────────────────────────────────────────────────

// Changes the signed-in user's password and signs out their other sessions; returns the updated user
export async function changeOwnPassword(user: CurrentUser, currentPassword: unknown, newPassword: unknown, info: RequestInfo): Promise<CurrentUser> {
    const current = typeof currentPassword === "string" ? currentPassword : "";
    const next = typeof newPassword === "string" ? newPassword : "";

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    if (!row) throw new RequestError("Your account no longer exists.", 404);
    if (!(await verifyPassword(current, row.password_hash))) throw new RequestError("Your current password is not correct.");

    const problem = passwordProblem(next, row.username);
    if (problem) throw new RequestError(problem);
    if (next === current) throw new RequestError("The new password must be different from the current one.");

    const passwordHash = await hashPassword(next);
    return db.transaction(async (tx) => {
        await tx.update(users)
            .set({ password_hash: passwordHash, must_change_password: false, session_version: sql`${users.session_version} + 1` })
            .where(eq(users.id, user.id));
        await logActivity(tx, { id: user.id, username: user.username }, {
            action: "auth.password_changed",
            summary: `${user.name} changed their password`,
            entityType: "user",
            entityId: user.id,
        }, info);
        const [updated] = await tx.select().from(users).where(eq(users.id, user.id));
        return toCurrentUser(updated);
    });
}

// ─── Managing users (administrators) ──────────────────────────────────────────

export interface UserListItem {
    id: number;
    username: string;
    name: string;
    email: string | null;
    role: Role;
    is_active: boolean;
    must_change_password: boolean;
    locked: boolean;
    last_login_at: Date | null;
    created_at: Date | null;
}

export async function listUsers(): Promise<UserListItem[]> {
    const rows = await db.select().from(users).orderBy(asc(users.name));
    const now = Date.now();
    return rows.map((row) => ({
        id: Number(row.id),
        username: row.username,
        name: row.name,
        email: row.email,
        role: isRole(row.role) ? row.role : "staff",
        is_active: row.is_active,
        must_change_password: row.must_change_password,
        locked: !!row.locked_until && row.locked_until.getTime() > now,
        last_login_at: row.last_login_at,
        created_at: row.createdAt,
    }));
}

// Other active administrators, locked so two administrators can't demote each other at the same moment
async function otherActiveAdmins(executor: DbExecutor, excludingId: number): Promise<number> {
    const rows = await executor
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.is_active, true), ne(users.id, excludingId)))
        .for("update");
    return rows.length;
}

export interface NewUserInput {
    username?: unknown;
    name?: unknown;
    email?: unknown;
    role?: unknown;
    password?: unknown;
}

// Creates an account with a temporary password the user must change at first sign-in
export async function createUser(actor: Actor, input: NewUserInput, info: RequestInfo) {
    const username = normaliseUsername(input.username);
    const usernameError = usernameProblem(username);
    if (usernameError) throw new RequestError(usernameError);
    const name = cleanName(input.name);
    const email = cleanEmail(input.email);
    if (!isRole(input.role)) throw new RequestError("Choose a role for the user.");
    const role = input.role;

    const provided = typeof input.password === "string" ? input.password : "";
    const temporaryPassword = provided || generateTemporaryPassword();
    const problem = passwordProblem(temporaryPassword, username);
    if (problem) throw new RequestError(problem);

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existing) throw new RequestError(`The username "${username}" is already taken.`, 409);

    const passwordHash = await hashPassword(temporaryPassword);
    const id = await db.transaction(async (tx) => {
        const [result] = await tx.insert(users).values({
            username, name, email, role, password_hash: passwordHash, must_change_password: true,
        });
        const newId = Number(result.insertId);
        await logActivity(tx, actor, {
            action: "user.create",
            summary: `Created user "${username}" (${name}) as ${ROLE_INFO[role].label}`,
            entityType: "user",
            entityId: newId,
            details: { username, name, email, role },
        }, info);
        return newId;
    });
    return { id, username, temporaryPassword };
}

export interface UserUpdateInput {
    name?: unknown;
    email?: unknown;
    role?: unknown;
    is_active?: unknown;
}

// Changing someone's role or disabling them signs them out, so the change applies at once
export async function updateUser(actor: Actor, id: number, input: UserUpdateInput, info: RequestInfo) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) throw new RequestError("User not found.", 404);

    const next: Partial<{ name: string; email: string | null; role: Role; is_active: boolean }> = {};
    if (input.name !== undefined) next.name = cleanName(input.name);
    if (input.email !== undefined) next.email = cleanEmail(input.email);
    if (input.role !== undefined) {
        if (!isRole(input.role)) throw new RequestError("Unknown role.");
        next.role = input.role;
    }
    if (input.is_active !== undefined) {
        if (typeof input.is_active !== "boolean") throw new RequestError("is_active must be true or false.");
        next.is_active = input.is_active;
    }

    const isSelf = actor.id === id;
    if (isSelf && next.role !== undefined && next.role !== row.role) throw new RequestError("You cannot change your own role.");
    if (isSelf && next.is_active === false) throw new RequestError("You cannot disable your own account.");

    const changes = changedFields(
        { name: row.name, email: row.email, role: row.role, is_active: row.is_active },
        next
    );
    if (Object.keys(changes).length === 0) return { id, changed: false };

    const signOut = "role" in changes || "is_active" in changes;
    const losesAdmin = row.role === "admin" && row.is_active && ((next.role && next.role !== "admin") || next.is_active === false);
    await db.transaction(async (tx) => {
        if (losesAdmin && (await otherActiveAdmins(tx, id)) === 0) {
            throw new RequestError("This is the only active administrator. Make another user an administrator first.", 409);
        }
        await tx.update(users)
            .set({ ...next, ...(signOut ? { session_version: sql`${users.session_version} + 1` } : {}) })
            .where(eq(users.id, id));
        await logActivity(tx, actor, {
            action: "user.update",
            summary: `Updated user "${row.username}": ${describeUserChanges(changes)}`,
            entityType: "user",
            entityId: id,
            details: { changes },
        }, info);
    });
    return { id, changed: true };
}

function describeUserChanges(changes: Record<string, { from: unknown; to: unknown }>): string {
    return Object.entries(changes).map(([field, { from, to }]) => {
        if (field === "is_active") return to ? "enabled" : "disabled";
        if (field === "role") return `role ${isRole(from) ? ROLE_INFO[from].label : from} → ${isRole(to) ? ROLE_INFO[to].label : to}`;
        return `${field} changed`;
    }).join(", ");
}

// Gives the user a new temporary password, unlocks the account and signs them out everywhere
export async function resetUserPassword(actor: Actor, id: number, info: RequestInfo) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) throw new RequestError("User not found.", 404);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await db.transaction(async (tx) => {
        await tx.update(users)
            .set({
                password_hash: passwordHash,
                must_change_password: true,
                failed_login_attempts: 0,
                locked_until: null,
                session_version: sql`${users.session_version} + 1`,
            })
            .where(eq(users.id, id));
        await logActivity(tx, actor, {
            action: "user.password_reset",
            summary: `Reset the password of "${row.username}" (${row.name})`,
            entityType: "user",
            entityId: id,
        }, info);
    });
    return { id, username: row.username, temporaryPassword };
}

export async function signOutUserEverywhere(actor: Actor, id: number, info: RequestInfo) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) throw new RequestError("User not found.", 404);
    await db.transaction(async (tx) => {
        await tx.update(users).set({ session_version: sql`${users.session_version} + 1` }).where(eq(users.id, id));
        await logActivity(tx, actor, {
            action: "user.sign_out",
            summary: `Signed "${row.username}" out of every device`,
            entityType: "user",
            entityId: id,
        }, info);
    });
    return { id };
}
