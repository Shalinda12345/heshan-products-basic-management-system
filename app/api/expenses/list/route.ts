import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";
import { dateRangeParams, pageParams, statusParam } from "@/app/lib/validation";
import { listExpenses } from "@/app/services/expenses";

export const dynamic = "force-dynamic";

// GET /api/expenses/list — the expense register, newest first
//   ?from= &to=        inclusive dates (YYYY-MM-DD)
//   ?category=         one expense category
//   ?status=           posted | void | all (default all)
//   ?q=                expense number, category or employee
//   ?page= &page_size= 1-based page, 1-200 rows (default 50)
export async function GET(request: Request) {
    const auth = await authorize(request, "expenses.view");
    if (!auth.ok) return auth.response;
    try {
        const params = new URL(request.url).searchParams;
        const result = await listExpenses({
            ...dateRangeParams(params),
            ...pageParams(params),
            category: params.get("category") || null,
            status: statusParam(params),
            search: params.get("q"),
        });
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to list expenses:");
    }
}
