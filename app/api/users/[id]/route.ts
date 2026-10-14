import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { updateUser } from "@/app/services/users";

// PATCH /api/users/:id — any of { name, email, role, is_active }. A role change or disabling signs the user out.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "users.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "user id");
        const result = await updateUser(actorOf(auth.user), id, await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        return writeErrorJson(error, "Failed to update user:");
    }
}
