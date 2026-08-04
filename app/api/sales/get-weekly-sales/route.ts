import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales } from "@/app/db/schema";
import { and, gte, lte, desc } from "drizzle-orm"; 

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const reqYear = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : null;
        const reqMonth = searchParams.get("month") ? parseInt(searchParams.get("month")!, 10) - 1 : null;

        let startOfWeek: Date;
        let endOfWeek: Date;

        if (reqYear !== null && reqMonth !== null) {
            startOfWeek = new Date(reqYear, reqMonth, 1, 0, 0, 0, 0);
            endOfWeek = new Date(reqYear, reqMonth + 1, 0, 23, 59, 59, 999);
        } else {
            const now = new Date();
            startOfWeek = new Date(now);
            const dayOfWeek = now.getDay();
            const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            
            startOfWeek.setDate(now.getDate() - daysToSubtract);
            startOfWeek.setHours(0, 0, 0, 0);

            endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999); 
        }

        const weeklySales = await db
            .select()
            .from(sales)
            .where(
                and(
                    gte(sales.sale_date, startOfWeek),
                    lte(sales.sale_date, endOfWeek)
                )
            )
            // 2. Add the orderBy clause here (e.g., sorting by sale_date descending)
            .orderBy(desc(sales.sale_date)); 

        return NextResponse.json(weeklySales);
    } catch (error) {
        console.error("Failed to fetch weekly sales: ", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}