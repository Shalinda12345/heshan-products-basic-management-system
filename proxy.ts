import { NextRequest, NextResponse } from "next/server";
import { BACKGROUND_REQUEST_HEADER } from "@/app/lib/background-request";
import {
    PASSWORD_CHANGE_REQUIRED_MESSAGE,
    SESSION_COOKIE,
    createSessionToken,
    readSessionToken,
    sessionCookieOptions,
    shouldRenewSession,
} from "@/app/lib/session";
import { canOpenPage, homePathFor } from "@/app/lib/permissions";

// Quick checks on every request using only the signed cookie (no database): signed in, password changed,
// and the role may open this page. API routes check the user against the database themselves.

// While a new password is pending, only the account page and what it needs are reachable
const PASSWORD_CHANGE_PATHS = new Set(["/account", "/api/account/password", "/api/auth/check"]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Browsers send Origin with every POST/PUT/PATCH/DELETE; a different site's origin means a forged request.
// Compared like Next.js compares it for server actions (x-forwarded-host first, behind a reverse proxy).
function isSameOrigin(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    if (!origin) return true;
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

export async function proxy(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    const isApi = pathname.startsWith("/api/");

    if (isApi && !SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
        return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = await readSessionToken(token);

    // Login page: only for signed-out users
    if (pathname === "/login") {
        return session ? NextResponse.redirect(new URL(homePathFor(session.role), request.url)) : NextResponse.next();
    }

    if (!session) {
        // The client-side session poller must be able to ask while signed out
        if (pathname === "/api/auth/check") return NextResponse.next();

        // Protect API routes with a 401 instead of an HTML redirect
        if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Come back to the requested page after signing in
        const login = new URL("/login", request.url);
        if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
        return NextResponse.redirect(login);
    }

    if (session.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(pathname)) {
        if (isApi) return NextResponse.json({ error: PASSWORD_CHANGE_REQUIRED_MESSAGE }, { status: 403 });
        return NextResponse.redirect(new URL("/account", request.url));
    }

    if (!isApi && !canOpenPage(session.role, pathname)) {
        // The dashboard is everyone's default address: send roles without it to their own start page
        const target = pathname === "/" ? homePathFor(session.role) : "/forbidden";
        return NextResponse.redirect(new URL(target, request.url));
    }

    const response = NextResponse.next();
    // Sliding session: real user activity extends it. The session poller and background
    // refreshes don't count, otherwise an open tab would never time out.
    const isUserActivity = pathname !== "/api/auth/check" && !request.headers.has(BACKGROUND_REQUEST_HEADER);
    if (isUserActivity && shouldRenewSession(session)) {
        response.cookies.set(SESSION_COOKIE, await createSessionToken(session), sessionCookieOptions());
    }
    return response;
}

export const config = {
    matcher: [
        /*
          Run on every request except:
          - Next.js assets (_next/static, _next/image)
          - favicon and static images served from /public
        */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
    ],
};
