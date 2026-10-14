"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/app/lib/session";

export async function handleLogin(prevState: unknown, formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    // `username` is echoed back so the form can keep it after a failed attempt
    if (!username || !password) {
        return {
            error: "Username and password are required.",
            username,
        };
    }

    // Replace this with your database authentication
    if (username !== "admin" || password !== "admin") {
        return {
            error: "Invalid username or password.",
            username,
        };
    }

    // Create a signed, expiring session cookie
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());

    redirect("/");
}