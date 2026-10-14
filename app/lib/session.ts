// Signed session tokens for the auth_token cookie, in the form "v1.<expiresAtMs>.<base64url HMAC-SHA256>".
// Uses Web Crypto so the same code runs in the proxy, route handlers and server actions.

export const SESSION_COOKIE = "auth_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 hour of inactivity

// Sent by automatic background refreshes (live stock, dashboard). The proxy does not treat them as
// user activity, so a screen left open doesn't keep its session alive forever.
export const BACKGROUND_REQUEST_HEADER = "x-background-refresh";

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

function toBase64Url(bytes: ArrayBuffer): string {
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

export async function createSessionToken(now = Date.now()): Promise<string> {
    const payload = `v1.${now + SESSION_MAX_AGE_SECONDS * 1000}`;
    const signature = await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(payload));
    return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
    const parts = token?.split(".") ?? [];
    if (parts.length !== 3 || parts[0] !== "v1") return false;

    const [version, expiresAt, signature] = parts;
    if (!(Number(expiresAt) > Date.now())) return false;

    const signatureBytes = fromBase64Url(signature);
    if (!signatureBytes) return false;

    return crypto.subtle.verify("HMAC", await getKey(), signatureBytes, encoder.encode(`${version}.${expiresAt}`));
}

// True once less than half of a (valid) session's lifetime is left, so active users get a fresh
// token instead of being signed out mid-task when the original hour runs out.
export function shouldRenewSession(token: string | undefined, now = Date.now()): boolean {
    const expiresAt = Number(token?.split(".")[1]);
    return Number.isFinite(expiresAt) && expiresAt - now < (SESSION_MAX_AGE_SECONDS * 1000) / 2;
}
