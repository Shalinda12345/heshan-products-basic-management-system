import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales } from "@/app/db/schema";
import { and, gte, lte, desc } from "drizzle-orm";

export async function GET() {
    try {
        const now = new Date();

        // 1. Get the first day of the current month at 00:00:00.000
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

        // 2. Get the last day of the current month at 23:59:59.999
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // 3. Query the database
        const monthlySales = await db
            .select()
            .from(sales)
            .where(
                and(
                    gte(sales.sale_date, startOfMonth),
                    lte(sales.sale_date, endOfMonth)
                )
            )
            .orderBy(desc(sales.sale_date));

        return NextResponse.json(monthlySales);
    } catch (error) {
        console.error("Failed to fetch monthly sales: ", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}