import { NextResponse } from "next/server";
import { readErrorJson, readJson, writeErrorJson } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { canSeeCosts } from "@/app/lib/permissions";
import { requestInfo } from "@/app/services/activity";
import { listStockLevels, recordStockMovement, type StockMovementRequest } from "@/app/services/stock";

export const dynamic = "force-dynamic";

// GET /api/stock — every product with its current level and today's movement totals.
// Unit costs (for stock value) only go to those who see margins.
export async function GET(request: Request) {
    const auth = await authorize(request, "stock.view");
    if (!auth.ok) return auth.response;
    try {
        return NextResponse.json(await listStockLevels(canSeeCosts(auth.user.role)), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return readErrorJson(error, "Failed to fetch stock status:");
    }
}

// POST /api/stock — record stock moving in or out by hand
//   { product_id, quantity, direction?: "IN" | "OUT" (default IN), movement_type?, note?, movement_date?: "YYYY-MM-DD" }
export async function POST(request: Request) {
    const auth = await authorize(request, "stock.move");
    if (!auth.ok) return auth.response;
    try {
        const data = await recordStockMovement(actorOf(auth.user), await readJson<StockMovementRequest>(request), requestInfo(request));
        return NextResponse.json({ success: true, data });
    } catch (error) {
        return writeErrorJson(error, "Failed to record stock movement:");
    }
}
