// Server-side identity and permission checks (the data access layer for "who is asking").
// Route handlers call authorize(request, permission) first; server components and actions use getCurrentUser().
import { cache } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import {
    FORBIDDEN_MESSAGE,
    PASSWORD_CHANGE_REQUIRED_MESSAGE,
    SESSION_COOKIE,
    SESSION_ENDED_MESSAGE,
    readSessionToken,
    type SessionClaims,
} from "./session";
import { canOpenPage, hasPermission, homePathFor, isRole, permissionsFor, type Permission, type Role } from "./permissions";
import { toReadErrorResponse } from "./api-error";
import type { Actor } from "../services/activity";

export interface CurrentUser {
    id: number;
    username: string;
    name: string;
    email: string | null;
    role: Role;
    mustChangePassword: boolean;
    sessionVersion: number;
}

// What the pages are told about the signed-in user
export interface UserInfo {
    id: number;
    username: string;
    name: string;
    role: Role;
    permissions: Permission[];
    mustChangePassword: boolean;
}

export function toUserInfo(user: CurrentUser): UserInfo {
    return {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: permissionsFor(user.role),
        mustChangePassword: user.mustChangePassword,
    };
}

export function actorOf(user: CurrentUser): Actor {
    return { id: user.id, username: user.username };
}

export function sessionClaims(user: CurrentUser): SessionClaims {
    return { userId: user.id, version: user.sessionVersion, role: user.role, mustChangePassword: user.mustChangePassword };
}

// Where to go after signing in: the page the user asked for, if it's a page on this site their role can open
export function landingPath(user: CurrentUser, requested?: string | null): string {
    if (user.mustChangePassword) return "/account";
    const home = homePathFor(user.role);
    const path = requested ?? "";
    if (!path.startsWith("/")) return home;
    // Read the path the way a browser will (which drops tabs and line breaks and treats "\" as "/"),
    // so nothing like "/\t/other-site.example" can lead off this site
    let url: URL;
    try {
        url = new URL(path, "http://this-site.invalid");
    } catch {
        return home;
    }
    if (url.origin !== "http://this-site.invalid") return home;
    if (url.pathname.startsWith("/login") || url.pathname.startsWith("/api/") || !canOpenPage(user.role, url.pathname)) return home;
    return `${url.pathname}${url.search}${url.hash}`;
}

export function cookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
    for (const part of cookieHeader?.split(";") ?? []) {
        const separator = part.indexOf("=");
        if (separator > 0 && part.slice(0, separator).trim() === name) {
            const value = part.slice(separator + 1).trim();
            try {
                return decodeURIComponent(value);
            } catch {
                // Not valid percent-encoding: it can't be one of our tokens, so the session check simply fails
                return value;
            }
        }
    }
    return undefined;
}

// The user a session token belongs to, if the token is valid and the account still allows it
export async function userForToken(token: string | undefined): Promise<CurrentUser | null> {
    const session = await readSessionToken(token);
    if (!session) return null;

    const [row] = await db
        .select({
            id: users.id,
            username: users.username,
            name: users.name,
            email: users.email,
            role: users.role,
            is_active: users.is_active,
            must_change_password: users.must_change_password,
            session_version: users.session_version,
        })
        .from(users)
        .where(eq(users.id, session.userId));

    if (!row || !row.is_active || row.session_version !== session.version || !isRole(row.role)) return null;

    return {
        id: Number(row.id),
        username: row.username,
        name: row.name,
        email: row.email,
        role: row.role,
        mustChangePassword: row.must_change_password,
        sessionVersion: row.session_version,
    };
}

export type AuthResult = { ok: true; user: CurrentUser } | { ok: false; response: Response };

// Error bodies follow the routes' existing convention: reads answer { error }, writes { success: false, message, error }
function deny(request: Request, status: number, message: string): { ok: false; response: Response } {
    const isRead = request.method === "GET" || request.method === "HEAD";
    const body = isRead ? { error: message } : { success: false, message, error: message };
    return { ok: false, response: Response.json(body, { status, headers: { "Cache-Control": "no-store" } }) };
}

// Checks the request's session against the database and, when given, the permission the action needs
export async function authorize(
    request: Request,
    permission?: Permission | null,
    options: { allowPendingPasswordChange?: boolean } = {}
): Promise<AuthResult> {
    try {
        const user = await userForToken(cookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE));
        if (!user) return deny(request, 401, SESSION_ENDED_MESSAGE);
        if (user.mustChangePassword && !options.allowPendingPasswordChange) {
            return deny(request, 403, PASSWORD_CHANGE_REQUIRED_MESSAGE);
        }
        if (permission && !hasPermission(user.role, permission)) return deny(request, 403, FORBIDDEN_MESSAGE);
        return { ok: true, user };
    } catch (error) {
        console.error("Failed to check the session:", error);
        const { message, status } = toReadErrorResponse(error);
        return deny(request, status, message);
    }
}

// The signed-in user for server components and server actions (once per request)
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    try {
        return await userForToken(token);
    } catch (error) {
        console.error("Failed to load the signed-in user:", error);
        return null;
    }
});
