import { NextRequest, NextResponse } from "next/server";
import {
    BACKGROUND_REQUEST_HEADER,
    SESSION_COOKIE,
    createSessionToken,
    sessionCookieOptions,
    shouldRenewSession,
    verifySessionToken,
} from "@/app/lib/session";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const authenticated = await verifySessionToken(token);

    // Login page: only for signed-out users
    if (pathname === "/login") {
        return authenticated ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
    }

    if (authenticated) {
        const response = NextResponse.next();
        // Sliding session: real user activity extends it. The session poller and background
        // refreshes don't count, otherwise an open tab would never time out.
        const isUserActivity = pathname !== "/api/auth/check" && !request.headers.has(BACKGROUND_REQUEST_HEADER);
        if (isUserActivity && shouldRenewSession(token)) {
            response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
        }
        return response;
    }

    // The client-side session poller must be able to ask while signed out
    if (pathname === "/api/auth/check") {
        return NextResponse.next();
    }

    // Protect API routes with a 401 instead of an HTML redirect
    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login", request.url));
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
