import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/session";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const authenticated = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

    // Login page: only for signed-out users
    if (pathname === "/login") {
        return authenticated ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
    }

    // The client-side session poller must be able to ask while signed out
    if (authenticated || pathname === "/api/auth/check") {
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
