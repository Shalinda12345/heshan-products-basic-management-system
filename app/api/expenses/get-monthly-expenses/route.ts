import { NextResponse } from "next/server";
import { readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { periodParams } from "@/app/lib/validation";
import { postedExpensesBetween } from "@/app/services/expenses";

export const dynamic = "force-dynamic";

// GET /api/expenses/get-monthly-expenses — the posted expenses dated this month, newest first (or another month with ?year=&month=)
export async function GET(request: Request) {
    const auth = await authorize(request, "expenses.view");
    if (!auth.ok) return auth.response;
    try {
        const { start, end } = periodParams(new URL(request.url).searchParams, "month");
        return NextResponse.json(await postedExpensesBetween(start, end));
    } catch (error) {
        return readErrorJson(error, "Failed to fetch monthly expenses:");
    }
}
