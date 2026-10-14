import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { signOutUserEverywhere } from "@/app/services/users";

// POST /api/users/:id/sign-out — ends every session of the user (e.g. a lost phone)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "users.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "user id");
        return NextResponse.json({ success: true, data: await signOutUserEverywhere(actorOf(auth.user), id, requestInfo(request)) });
    } catch (error) {
        return writeErrorJson(error, "Failed to sign the user out:");
    }
}
