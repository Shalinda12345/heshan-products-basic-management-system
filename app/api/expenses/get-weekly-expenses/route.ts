import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses } from "@/app/db/schema";
import { and, gte, lte, desc } from "drizzle-orm"; 

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const now = new Date();

        const startOfWeek = new Date(now);
        const dayOfWeek = now.getDay();
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        startOfWeek.setDate(now.getDate() - daysToSubtract);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(now);
        endOfWeek.setHours(23, 59, 59, 999); 

        const weeklyExpenses = await db
            .select()
            .from(expenses)
            .where(
                and(
                    gte(expenses.expense_date, startOfWeek),
                    lte(expenses.expense_date, endOfWeek)
                )
            )
            // 2. Add the orderBy clause here (e.g., sorting by sale_date descending)
            .orderBy(desc(expenses.expense_date)); 

        return NextResponse.json(weeklyExpenses);
    } catch (error) {
        console.error("Failed to fetch weekly sales: ", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}