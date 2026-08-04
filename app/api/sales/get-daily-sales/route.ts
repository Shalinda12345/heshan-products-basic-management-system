import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales } from "@/app/db/schema";
import { and, gte, lte, desc } from "drizzle-orm";

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

        const dailySales = await db
            .select()
            .from(sales)
            .where(
                and(
                    gte(sales.sale_date, start),
                    lte(sales.sale_date, end)
                )
            )
            .orderBy(desc(sales.sale_date));

        return NextResponse.json(dailySales);
    } catch (error) {
        console.error("Failed to fetch daily sales: ", error);
        return NextResponse.json(
            {error: "Internal Server Error"},
            {status: 500}
        );
    }
}