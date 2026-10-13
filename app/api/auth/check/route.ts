import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/session";

export async function GET() {
    const cookieStore = await cookies();

    const loggedIn = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

    return NextResponse.json({
        authenticated: loggedIn,
    });
}