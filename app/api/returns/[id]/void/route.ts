import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { voidReturn } from "@/app/services/returns";

// POST /api/returns/:id/void — { reason }. Reverses the return's effect on the invoice, stock and expenses.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "returns.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "return number");
        const body = await readJson(request);
        const result = await voidReturn(actorOf(auth.user), id, body.reason, requestInfo(request));
        return NextResponse.json({ success: true, message: `Return #${id} has been voided.`, data: result });
    } catch (error) {
        return writeErrorJson(error, "Failed to void return:");
    }
}
