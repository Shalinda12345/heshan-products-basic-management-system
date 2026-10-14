import { NextResponse } from "next/server";
import { authorize, sessionClaims } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/app/lib/session";
import { requestInfo } from "@/app/services/activity";
import { changeOwnPassword } from "@/app/services/users";

// POST /api/account/password — { current_password, new_password }
// Changes the signed-in user's password, signs out their other devices and keeps this browser signed in.
export async function POST(request: Request) {
    const auth = await authorize(request, null, { allowPendingPasswordChange: true });
    if (!auth.ok) return auth.response;

    try {
        const body = await readJson(request);
        const updated = await changeOwnPassword(auth.user, body.current_password, body.new_password, requestInfo(request));

        const response = NextResponse.json({ success: true, message: "Your password has been changed." });
        response.cookies.set(SESSION_COOKIE, await createSessionToken(sessionClaims(updated)), sessionCookieOptions());
        return response;
    } catch (error) {
        return writeErrorJson(error, "Failed to change password:");
    }
}
