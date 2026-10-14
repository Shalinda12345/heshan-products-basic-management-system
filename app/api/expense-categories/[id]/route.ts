import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { updateExpenseCategory } from "@/app/services/expenseCategories";

// PATCH /api/expense-categories/:id — any of { expense_name, kind, is_active }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "category id");
        const category = await updateExpenseCategory(actorOf(auth.user), id, await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: category });
    } catch (error) {
        return writeErrorJson(error, "Failed to update expense category:");
    }
}
