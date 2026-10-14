import { NextResponse } from "next/server";
import { actorOf, authorize } from "@/app/lib/auth";
import { readErrorJson, readJson, writeErrorJson } from "@/app/lib/api-error";
import { requestInfo } from "@/app/services/activity";
import { createExpenseCategory, listExpenseCategories } from "@/app/services/expenseCategories";

export const dynamic = "force-dynamic";

// GET /api/expense-categories — active categories (?include_inactive=1 for all)
export async function GET(request: Request) {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    try {
        const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";
        return NextResponse.json(await listExpenseCategories({ includeInactive }), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch expense categories:");
    }
}

// POST /api/expense-categories — { expense_name, kind?: "standard" | "quantity" | "salary" | "return" }
export async function POST(request: Request) {
    const auth = await authorize(request, "masterdata.manage");
    if (!auth.ok) return auth.response;
    try {
        const category = await createExpenseCategory(actorOf(auth.user), await readJson(request), requestInfo(request));
        return NextResponse.json({ success: true, data: category }, { status: 201 });
    } catch (error) {
        return writeErrorJson(error, "Failed to create expense category:");
    }
}
