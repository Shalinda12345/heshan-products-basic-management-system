import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses } from "@/app/db/schema";
import { and, gte, lte, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const now = new Date();
        const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : now.getFullYear();
        const month = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) - 1 : now.getMonth();

        // 1. Get the first day of the target month at 00:00:00.000
        const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);

        // 2. Get the last day of the target month at 23:59:59.999
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // 3. Query the database
        const monthlyExpenses = await db
            .select()
            .from(expenses)
            .where(
                and(
                    gte(expenses.expense_date, startOfMonth),
                    lte(expenses.expense_date, endOfMonth)
                )
            )
            .orderBy(desc(expenses.expense_date));

        return NextResponse.json(monthlyExpenses);
    } catch (error) {
        console.error("Failed to fetch monthly expenses: ", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}