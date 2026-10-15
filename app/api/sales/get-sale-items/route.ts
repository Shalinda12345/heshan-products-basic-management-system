import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sale_items } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { RequestError, readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const auth = await authorize(request, "sales.view");
    if (!auth.ok) return auth.response;
    try {
        const { searchParams } = new URL(request.url);
        const saleId = searchParams.get("sale_id");

        if (!saleId) throw new RequestError("Missing parameter: sale_id");
        if (!Number.isInteger(Number(saleId)) || Number(saleId) <= 0) {
            throw new RequestError("Invalid parameter: sale_id must be a positive integer");
        }

        const items = await db
            .select()
            .from(sale_items)
            .where(eq(sale_items.sale_id, Number(saleId)));

        return NextResponse.json(items);
    } catch (error) {
        return readErrorJson(error, "Failed to fetch sale items:");
    }
}
