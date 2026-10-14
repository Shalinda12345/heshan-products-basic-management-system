import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses } from "@/app/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { toReadErrorResponse } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { hasPermission } from "@/app/lib/permissions";
import { postedExpense } from "@/app/services/expenses";

export const dynamic = "force-dynamic";

// Today's expenses (the New Expense ledger), or the given month's with ?year=&month=.
// Users who may record expenses but not see them all get only the entries they recorded themselves.
export async function GET(request: Request){
    const auth = await authorize(request, "expenses.create");
    if (!auth.ok) return auth.response;
    const seesAll = hasPermission(auth.user.role, "expenses.view");
    try{
        const { searchParams } = new URL(request.url);
        const reqYear = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : null;
        const reqMonth = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) - 1 : null;

        let start: Date;
        let end: Date;

        if (reqYear !== null && reqMonth !== null) {
            start = new Date(reqYear, reqMonth, 1, 0, 0, 0, 0);
            end = new Date(reqYear, reqMonth + 1, 0, 23, 59, 59, 999);
        } else {
            start = new Date();
            start.setHours(0, 0, 0, 0);
            end = new Date();
            end.setHours(23, 59, 59, 999);
        }

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
        console.error("Failed to fetch daily expenses: ", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}