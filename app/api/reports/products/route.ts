import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { RequestError, readErrorJson } from "@/app/lib/api-error";
import { rangeDays } from "@/app/lib/periods";
import { dateRangeParams } from "@/app/lib/validation";
import { productsReport } from "@/app/services/reports";

export const dynamic = "force-dynamic";

// GET /api/reports/products?from=YYYY-MM-DD&to=YYYY-MM-DD — the product performance for the period,
// compared with the period before it
export async function GET(request: Request) {
    const auth = await authorize(request, "reports.view");
    if (!auth.ok) return auth.response;
    try {
        const { from, to } = dateRangeParams(new URL(request.url).searchParams, true);
        const range = { from: from!, to: to! };
        if (rangeDays(range) > 3660) throw new RequestError("Invalid parameters: the period can be at most 10 years");
        return NextResponse.json(await productsReport(range), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to build the product performance report:");
    }
}
