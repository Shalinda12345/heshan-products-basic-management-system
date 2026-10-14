import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { resetUserPassword } from "@/app/services/users";

// POST /api/users/:id/reset-password — new temporary password (shown once), unlocks and signs the user out
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "users.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "user id");
        const result = await resetUserPassword(actorOf(auth.user), id, requestInfo(request));
        return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return writeErrorJson(error, "Failed to reset password:");
    }
}
