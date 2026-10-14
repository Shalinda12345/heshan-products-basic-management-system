import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/app/db";
import { products, stocks } from "@/app/db/schema";
import { RequestError, readJson, writeErrorJson } from "@/app/lib/api-error";
import { actorOf, authorize } from "@/app/lib/auth";
import { parseLocalDate, toIsoDate } from "@/app/lib/dates";
import { formatQty } from "@/app/lib/format";
import { roundMoney } from "@/app/lib/money";
import { isoDate, optionalText, positiveId } from "@/app/lib/validation";
import { logActivity, requestInfo } from "@/app/services/activity";
import { applyStockMovement } from "@/app/services/stockLedger";

// POST /api/stock/adjust — set a product's stock to a physical count
//   { product_id, counted_quantity, note?, movement_date?: "YYYY-MM-DD" (default today) }
// Records the difference as a count correction (+ or −) in the stock ledger.
export async function POST(request: Request) {
    const auth = await authorize(request, "stock.adjust");
    if (!auth.ok) return auth.response;
    try {
        const body = await readJson(request);
        const productId = positiveId(body.product_id, "product");
        const counted = Number(body.counted_quantity);
        if (body.counted_quantity === undefined || body.counted_quantity === null || body.counted_quantity === ""
            || !Number.isFinite(counted) || counted < 0) {
            throw new RequestError("Counted quantity must be a number of 0 or more.");
        }
        const note = optionalText(body.note, "Note");
        const date = body.movement_date ? isoDate(body.movement_date, "Count date") : toIsoDate(new Date());
        const movementDate = parseLocalDate(date);
        if (movementDate.getTime() > Date.now()) throw new RequestError("Count date cannot be in the future.");

        const actor = actorOf(auth.user);
        const result = await db.transaction(async (tx) => {
            const [product] = await tx.select().from(products).where(eq(products.product_id, productId));
            if (!product) throw new RequestError(`Product ID ${productId} not found.`, 404);

            const [stockRow] = await tx.select().from(stocks).where(eq(stocks.product_id, productId)).for("update");
            const before = stockRow ? Number(stockRow.quantity) : 0;
            const difference = roundMoney(counted - before);

            let movementId: number | null = null;
            if (difference !== 0) {
                const movement = await applyStockMovement(tx, {
                    productId,
                    productName: product.product_name,
                    movementType: difference > 0 ? "adjustment_in" : "adjustment_out",
                    quantity: Math.abs(difference),
                    movementDate,
                    reference: "Stock count",
                    note: note ?? `Counted ${formatQty(counted)} (system had ${formatQty(before)})`,
                    createdBy: actor.id,
                });
                movementId = movement.movementId;
            }

            await logActivity(tx, actor, {
                action: "stock.count",
                summary: difference === 0
                    ? `Stock count for ${product.product_name}: ${formatQty(counted)}, matches the system`
                    : `Stock count for ${product.product_name}: system ${formatQty(before)}, counted ${formatQty(counted)} (${difference > 0 ? "+" : "−"}${formatQty(Math.abs(difference))})${note ? `. Note: ${note}` : ""}`,
                entityType: "product",
                entityId: productId,
                details: { before, counted, difference, movement_id: movementId, movement_date: date, note },
            }, requestInfo(request));

            return { product_id: productId, before, counted, difference, movement_id: movementId };
        });

        return NextResponse.json({
            success: true,
            message: result.difference === 0 ? "The count matches the system; nothing to correct." : "Stock corrected to the count.",
            data: result,
        });
    } catch (error) {
        return writeErrorJson(error, "Failed to correct stock to count:");
    }
}
