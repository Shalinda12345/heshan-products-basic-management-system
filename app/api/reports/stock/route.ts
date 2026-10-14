import { NextResponse } from "next/server";
import { authorize } from "@/app/lib/auth";
import { readErrorJson } from "@/app/lib/api-error";
import { stockReport } from "@/app/services/reports";

export const dynamic = "force-dynamic";

// GET /api/reports/stock — stock value, reorder alerts, days of cover and slow-moving stock, as of today
export async function GET(request: Request) {
    const auth = await authorize(request, "reports.view");
    if (!auth.ok) return auth.response;
    try {
        return NextResponse.json(await stockReport(), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to build the stock report:");
    }
}
