import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses } from "@/app/db/schema";
import { and, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request){
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
                    lte(expenses.expense_date, end)
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