import { NextResponse } from "next/server";
import { readJson, writeErrorJson } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { requestInfo } from "@/app/services/activity";
import { countStock, type StockCountRequest } from "@/app/services/stock";

// POST /api/stock/adjust — set a product's stock to a physical count
//   { product_id, counted_quantity, note?, movement_date?: "YYYY-MM-DD" (default today) }
// Records the difference as a count correction (+ or −) in the stock ledger.
export async function POST(request: Request) {
    const auth = await authorize(request, "stock.adjust");
    if (!auth.ok) return auth.response;
    try {
        const result = await countStock(actorOf(auth.user), await readJson<StockCountRequest>(request), requestInfo(request));
        return NextResponse.json({
            success: true,
            message: result.difference === 0 ? "The count matches the system; nothing to correct." : "Stock corrected to the count.",
            data: result,
        });
    } catch (error) {
        return writeErrorJson(error, "Failed to correct stock to count:");
    }
}
