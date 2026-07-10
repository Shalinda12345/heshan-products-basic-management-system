"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function handleLogin(prevState: any, formData: FormData) {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    if (!username || !password) {
        return {
            error: "Username and password are required.",
        };
    }

    // Replace this with your database authentication
    if (username !== "admin" || password !== "admin") {
        return {
            error: "Invalid username or password.",
        };
    }

    // Create cookie
    const cookieStore = await cookies();

    cookieStore.set("auth_token", "logged_in", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15,
    });

    redirect("/");
}