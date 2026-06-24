import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { sale_items } from "@/app/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const saleId = searchParams.get("sale_id");

        if (!saleId) {
            return NextResponse.json(
                { error: "Missing parameter: sale_id" },
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
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
