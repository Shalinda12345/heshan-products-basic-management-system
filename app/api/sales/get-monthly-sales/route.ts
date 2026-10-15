import { NextResponse } from "next/server";
import { readErrorJson } from "@/app/lib/api-error";
import { authorize } from "@/app/lib/auth";
import { periodParams } from "@/app/lib/validation";
import { postedSalesBetween } from "@/app/services/sales";

export const dynamic = "force-dynamic";

// GET /api/sales/get-monthly-sales — the posted invoices dated this month, newest first (or another month with ?year=&month=)
export async function GET(request: Request) {
    const auth = await authorize(request, "sales.view");
    if (!auth.ok) return auth.response;
    try {
        const { start, end } = periodParams(new URL(request.url).searchParams, "month");
        return NextResponse.json(await postedSalesBetween(start, end));
    } catch (error) {
        return readErrorJson(error, "Failed to fetch monthly sales:");
    }
}
