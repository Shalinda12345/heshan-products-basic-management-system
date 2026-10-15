import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sales } from "@/app/db/schema";
import { desc } from "drizzle-orm";
import { readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { postedSale } from "@/app/services/sales";

export const dynamic = "force-dynamic";

/**
 * GET /api/sales/get-sales-list
 * Returns all posted (not voided) sales transactions for display in the return-type sale selector.
 * Fields: sale_id, customer_name, sale_date, grand_total
 */
export async function GET(request: Request) {
    const auth = await authorize(request, "sales.view");
    if (!auth.ok) return auth.response;
    try {
        const allSales = await db
            .select({
                sale_id: sales.sale_id,
                customer_name: sales.customer_name,
                sale_date: sales.sale_date,
                grand_total: sales.grand_total,
            })
            .from(sales)
            .where(postedSale)
            .orderBy(desc(sales.sale_id));

        return NextResponse.json(allSales);
    } catch (error) {
        return readErrorJson(error, "Failed to fetch sales list:");
    }
}
