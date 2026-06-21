import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses } from "@/app/db/schema";
import { and, gte, lte } from "drizzle-orm";

export async function GET(){
    try{
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const dailyExpenses = await db
            .select()
            .from(expenses)
            .where(
                and(
                    gte(expenses.expense_date, startOfToday),
                    lte(expenses.expense_date, endOfToday)
                )
            );

        return NextResponse.json(dailyExpenses);
    } catch (error) {
        console.error("Failed to fetch daily expenses: ", error);
        return NextResponse.json(
            {error: "Internal Server Error"},
            {status: 500}
        );
    }
}