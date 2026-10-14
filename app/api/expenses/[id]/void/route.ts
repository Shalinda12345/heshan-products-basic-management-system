import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { voidExpense } from "@/app/services/expenses";

// POST /api/expenses/:id/void — { reason }. The expense stays on file, marked void, and leaves every total.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "expenses.edit");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "expense id");
        const body = await readJson(request);
        const result = await voidExpense(actorOf(auth.user), id, body.reason, requestInfo(request));
        return NextResponse.json({ success: true, message: `Expense #${id} has been voided.`, data: result });
    } catch (error) {
        return writeErrorJson(error, "Failed to void expense:");
    }
}
