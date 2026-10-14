import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readErrorJson, readJson, writeErrorJson } from "@/app/lib/api-error";
import { requestInfo } from "@/app/services/activity";
import { createUser, listUsers } from "@/app/services/users";

export const dynamic = "force-dynamic";

// GET /api/users — every account (administrators only)
export async function GET(request: Request) {
    const auth = await authorize(request, "users.manage");
    if (!auth.ok) return auth.response;
    try {
        return NextResponse.json(await listUsers(), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch users:");
    }
}

// POST /api/users — { username, name, role, email?, password? }
// Answers with the temporary password (generated unless given), which is shown to the administrator once.
export async function POST(request: Request) {
    const auth = await authorize(request, "users.manage");
    if (!auth.ok) return auth.response;
    try {
        const result = await createUser(actorOf(auth.user), await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return writeErrorJson(error, "Failed to create user:");
    }
}
