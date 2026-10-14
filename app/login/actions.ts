"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/app/lib/session";
import { landingPath, sessionClaims } from "@/app/lib/auth";
import { DATABASE_OUTDATED_MESSAGE, DATABASE_UNAVAILABLE_MESSAGE, toReadErrorResponse } from "@/app/lib/api-error";
import { requestInfo } from "@/app/services/activity";
import { signIn } from "@/app/services/users";

export interface LoginState {
    error?: string;
    username?: string;
}

export async function handleLogin(prevState: LoginState | null, formData: FormData): Promise<LoginState> {
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const next = String(formData.get("next") ?? "");

    // `username` is echoed back so the form can keep it after a failed attempt
    let result;
    try {
        result = await signIn(username, password, requestInfo(await headers()));
    } catch (error) {
        console.error("Sign-in failed:", error);
        const { message } = toReadErrorResponse(error);
        const known = message === DATABASE_UNAVAILABLE_MESSAGE || message === DATABASE_OUTDATED_MESSAGE;
        return { error: known ? message : "Sign-in failed because of a server problem. Please try again.", username };
    }
    if (!result.ok) return { error: result.message, username };

    // A signed, expiring session cookie that names the user
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await createSessionToken(sessionClaims(result.user)), sessionCookieOptions());

    redirect(landingPath(result.user, next));
}
