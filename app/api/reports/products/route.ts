import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";
import { reportRangeParams } from "@/app/lib/validation";
import { productsReport } from "@/app/services/reports";

export const dynamic = "force-dynamic";

// GET /api/reports/products?from=YYYY-MM-DD&to=YYYY-MM-DD — the product performance for the period,
// compared with the period before it
export async function GET(request: Request) {
    const auth = await authorize(request, "reports.view");
    if (!auth.ok) return auth.response;
    try {
        const range = reportRangeParams(new URL(request.url).searchParams);
        return NextResponse.json(await productsReport(range), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to build the product performance report:");
    }
}
