import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales } from "@/app/db/schema";
import { and, gte, lte, desc } from "drizzle-orm";

export async function GET(){
    try{
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const dailySales = await db
            .select()
            .from(sales)
            .where(
                and(
                    gte(sales.sale_date, startOfToday),
                    lte(sales.sale_date, endOfToday)
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