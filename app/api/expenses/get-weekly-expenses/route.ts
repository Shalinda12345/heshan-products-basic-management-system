import { NextResponse } from "next/server";
import { readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { periodParams } from "@/app/lib/validation";
import { postedExpensesBetween } from "@/app/services/expenses";

export const dynamic = "force-dynamic";

// GET /api/expenses/get-weekly-expenses — the posted expenses dated this week (Monday to Sunday), newest first (or a whole month with ?year=&month=)
export async function GET(request: Request) {
    const auth = await authorize(request, "expenses.view");
    if (!auth.ok) return auth.response;
    try {
        const { start, end } = periodParams(new URL(request.url).searchParams, "week");
        return NextResponse.json(await postedExpensesBetween(start, end));
    } catch (error) {
        return readErrorJson(error, "Failed to fetch weekly expenses:");
    }
}
