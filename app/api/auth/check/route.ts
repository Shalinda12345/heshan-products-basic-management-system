import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/session";
import { cookieFromHeader, userForToken } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";

export const dynamic = "force-dynamic";

// Polled by the pages: is this browser's session still good? A session whose user was disabled, or whose
// password was changed elsewhere, gets its cookie cleared here so the browser goes back to the login page.
export async function GET(request: Request) {
    const token = cookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });

    try {
        const user = await userForToken(token);
        const response = NextResponse.json({ authenticated: !!user }, { headers: { "Cache-Control": "no-store" } });
        if (!user) response.cookies.delete(SESSION_COOKIE);
        return response;
    } catch (error) {
        // The database can't be asked right now: say so rather than signing everyone out
        return readErrorJson(error, "Session check failed:");
    }
}
