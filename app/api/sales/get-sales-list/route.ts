import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales } from "@/app/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/sales/get-sales-list
 * Returns all sales transactions for display in the return-type sale selector.
 * Fields: sale_id, customer_name, sale_date, grand_total
 */
export async function GET() {
    try {
        const allSales = await db
            .select({
                sale_id: sales.sale_id,
                customer_name: sales.customer_name,
                sale_date: sales.sale_date,
                grand_total: sales.grand_total,
            })
            .from(sales)
            .orderBy(desc(sales.sale_id));

        return NextResponse.json(allSales);
    } catch (error) {
        console.error("Failed to fetch sales list:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
