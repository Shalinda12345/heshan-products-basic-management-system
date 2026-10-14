import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";
import { listExpenseCategories } from "@/app/services/expenseCategories";

export const dynamic = "force-dynamic";

// GET /api/expenses/get-expense-item-list — the active expense categories, with how each is entered (kind)
export async function GET(request: Request) {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    try {
        return NextResponse.json(await listExpenseCategories(), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch Expense Items: ");
    }
}
