import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";
import { reportRangeParams } from "@/app/lib/validation";
import { customersReport } from "@/app/services/reports";

export const dynamic = "force-dynamic";

// GET /api/reports/customers?from=YYYY-MM-DD&to=YYYY-MM-DD — the customer performance for the period,
// compared with the period before it
export async function GET(request: Request) {
    const auth = await authorize(request, "reports.view");
    if (!auth.ok) return auth.response;
    try {
        const range = reportRangeParams(new URL(request.url).searchParams);
        return NextResponse.json(await customersReport(range), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to build the customer performance report:");
    }
}
