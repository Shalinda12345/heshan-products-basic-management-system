import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
    const authToken = request.cookies.get("auth_token");

    const { pathname } = request.nextUrl;

    // Public routes
    const publicRoutes = ["/login"];

    // Allow access to public routes
    if (publicRoutes.includes(pathname)) {
        // If already logged in, don't allow going back to login
        if (authToken) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        return NextResponse.next();
    }

    // Protect all other pages
    if (!authToken) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
          Run middleware on every page except:
          - API routes
          - Next.js assets
          - favicon
        */
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};