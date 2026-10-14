import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sale_items } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { toReadErrorResponse } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await authorize(request, "sales.view");
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        const saleId = searchParams.get("sale_id");

        if (!saleId) {
            return NextResponse.json(
                { error: "Missing parameter: sale_id" },
                { status: 400 }
            );
        }
        if (!Number.isInteger(Number(saleId)) || Number(saleId) <= 0) {
            return NextResponse.json(
                { error: "Invalid parameter: sale_id must be a positive integer" },
                { status: 400 }
            );
        }

        const items = await db
            .select()
            .from(sale_items)
            .where(eq(sale_items.sale_id, Number(saleId)));

        return NextResponse.json(items);
    } catch (error) {
        console.error("Failed to fetch sale items: ", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}
