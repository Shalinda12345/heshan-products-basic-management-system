import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/app/db";
import { expenses } from "@/app/db/schema";
import { readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { hasPermission } from "@/app/lib/permissions";
import { periodParams } from "@/app/lib/validation";
import { postedExpense } from "@/app/services/expenses";

export const dynamic = "force-dynamic";

// Today's expenses (the New Expense ledger), or the given month's with ?year=&month=.
// Users who may record expenses but not see them all get only the entries they recorded themselves.
export async function GET(request: Request) {
    const auth = await authorize(request, "expenses.create");
    if (!auth.ok) return auth.response;
    const seesAll = hasPermission(auth.user.role, "expenses.view");
    try {
        const { start, end } = periodParams(new URL(request.url).searchParams, "day");
        const dailyExpenses = await db
            .select()
            .from(expenses)
            .where(
                and(
                    gte(expenses.expense_date, start),
                    lte(expenses.expense_date, end),
                    postedExpense,
                    seesAll ? undefined : eq(expenses.created_by, auth.user.id)
                )
            );

        return NextResponse.json(dailyExpenses);
    } catch (error) {
        return readErrorJson(error, "Failed to fetch daily expenses:");
    }
}
