"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/app/db";
import { SESSION_COOKIE } from "@/app/lib/session";
import { actorOf, getCurrentUser } from "@/app/lib/auth";
import { logActivity, requestInfo } from "@/app/services/activity";

export async function logout() {
    const user = await getCurrentUser();
    if (user) {
        try {
            await logActivity(db, actorOf(user), {
                action: "auth.logout",
                summary: `${user.name} signed out`,
                entityType: "user",
                entityId: user.id,
            }, requestInfo(await headers()));
        } catch (error) {
            // Signing out must still work when the log can't be written
            console.error("Failed to record sign-out:", error);
        }
    }

    const cookieStore = await cookies();

    cookieStore.delete(SESSION_COOKIE);

    redirect("/login");
}
