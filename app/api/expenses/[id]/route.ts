import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { positiveId } from "@/app/lib/validation";
import { requestInfo } from "@/app/services/activity";
import { updateExpense } from "@/app/services/expenses";

// PATCH /api/expenses/:id — correct any of { expense_name, employee_name, quantity, per_expense_amount, expense_date }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authorize(request, "expenses.edit");
    if (!auth.ok) return auth.response;
    try {
        const id = positiveId((await params).id, "expense id");
        const result = await updateExpense(actorOf(auth.user), id, await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        return writeErrorJson(error, "Failed to update expense:");
    }
}
