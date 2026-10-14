// Signed session tokens for the auth_token cookie, in the form "v2.<base64url JSON claims>.<base64url HMAC-SHA256>".
// Uses Web Crypto so the same code runs in the proxy, route handlers and server actions.
//
// The token is only proof of who signed in and when. Every API request also checks the user in the database
// (still active, same session version), so deactivating a user or resetting their password ends their sessions.

import { isRole, type Role } from "./permissions";

export const SESSION_COOKIE = "auth_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 hour of inactivity

// Sent by automatic background refreshes (live stock, dashboard). The proxy does not treat them as
// user activity, so a screen left open doesn't keep its session alive forever.
export const BACKGROUND_REQUEST_HEADER = "x-background-refresh";

export interface SessionClaims {
    userId: number;
    // users.session_version when the token was issued; bumping it signs the user out everywhere
    version: number;
    role: Role;
    // The user must choose a new password before doing anything else
    mustChangePassword: boolean;
}

export interface Session extends SessionClaims {
    expiresAt: number;
}

export function sessionCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
    };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let keyPromise: Promise<CryptoKey> | undefined;

function getKey(): Promise<CryptoKey> {
    if (!keyPromise) {
        // Prefer a dedicated AUTH_SECRET; fall back to a key derived from DATABASE_URL so deployments
        // without AUTH_SECRET keep working (anyone who knows DATABASE_URL already has full data access).
        const secret = process.env.AUTH_SECRET || (process.env.DATABASE_URL ? `session:${process.env.DATABASE_URL}` : "");
        if (!secret) {
            throw new Error("AUTH_SECRET (or DATABASE_URL) must be set to sign login sessions.");
        }
        keyPromise = crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign", "verify"]
        );
    }
    return keyPromise;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
    try {
        return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    } catch {
        return null;
    }
}

export async function createSessionToken(claims: SessionClaims, now = Date.now()): Promise<string> {
    const body = {
        uid: claims.userId,
        ver: claims.version,
        role: claims.role,
        pwc: claims.mustChangePassword ? 1 : 0,
        exp: now + SESSION_MAX_AGE_SECONDS * 1000,
    };
    const payload = `v2.${toBase64Url(encoder.encode(JSON.stringify(body)))}`;
    const signature = await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(payload));
    return `${payload}.${toBase64Url(signature)}`;
}

// The session in a validly signed, unexpired token, or null
export async function readSessionToken(token: string | undefined, now = Date.now()): Promise<Session | null> {
    const parts = token?.split(".") ?? [];
    if (parts.length !== 3 || parts[0] !== "v2") return null;

    const [version, body, signature] = parts;
    const signatureBytes = fromBase64Url(signature);
    const bodyBytes = fromBase64Url(body);
    if (!signatureBytes || !bodyBytes) return null;

    const valid = await crypto.subtle.verify("HMAC", await getKey(), signatureBytes, encoder.encode(`${version}.${body}`));
    if (!valid) return null;

    let claims: Record<string, unknown>;
    try {
        claims = JSON.parse(decoder.decode(bodyBytes));
    } catch {
        return null;
    }

    const { uid, ver, role, pwc, exp } = claims;
    if (!Number.isInteger(uid) || !Number.isInteger(ver) || !isRole(role) || typeof exp !== "number") return null;
    if (!(exp > now)) return null;

    return { userId: uid as number, version: ver as number, role, mustChangePassword: pwc === 1, expiresAt: exp };
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
    return (await readSessionToken(token)) !== null;
}

// True once less than half of a (valid) session's lifetime is left, so active users get a fresh
// token instead of being signed out mid-task when the original hour runs out.
export function shouldRenewSession(session: Session, now = Date.now()): boolean {
    return session.expiresAt - now < (SESSION_MAX_AGE_SECONDS * 1000) / 2;
}
