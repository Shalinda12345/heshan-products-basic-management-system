import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { stock_movements } from "@/app/db/schema";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { isIsoDate, parseLocalDate } from "@/app/lib/dates";
import { toReadErrorResponse } from "@/app/lib/api-error";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// GET /api/stock/movements — the stock ledger, newest first
//   ?product_id=  only one product
//   ?direction=   IN | OUT
//   ?from= &to=   inclusive business-date range (YYYY-MM-DD)
//   ?limit=       1-500 rows (default 100)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("product_id");
        const direction = searchParams.get("direction")?.toUpperCase();
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const limitParam = searchParams.get("limit");

        if (productId !== null && (!Number.isInteger(Number(productId)) || Number(productId) <= 0)) {
            return NextResponse.json({ error: "Invalid parameter: product_id must be a positive integer" }, { status: 400 });
        }
        if (direction !== undefined && direction !== "IN" && direction !== "OUT") {
            return NextResponse.json({ error: 'Invalid parameter: direction must be "IN" or "OUT"' }, { status: 400 });
        }
        if ((from !== null && !isIsoDate(from)) || (to !== null && !isIsoDate(to))) {
            return NextResponse.json({ error: "Invalid parameter: from/to must be YYYY-MM-DD dates" }, { status: 400 });
        }
        const limit = limitParam === null ? DEFAULT_LIMIT : Number(limitParam);
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
            return NextResponse.json({ error: `Invalid parameter: limit must be between 1 and ${MAX_LIMIT}` }, { status: 400 });
        }

        const filters: SQL[] = [];
        if (productId !== null) filters.push(eq(stock_movements.product_id, Number(productId)));
        if (direction) filters.push(eq(stock_movements.direction, direction));
        if (from) filters.push(gte(stock_movements.movement_date, parseLocalDate(from)));
        if (to) filters.push(lte(stock_movements.movement_date, parseLocalDate(to)));

        const rows = await db
            .select()
            .from(stock_movements)
            .where(filters.length ? and(...filters) : undefined)
            .orderBy(desc(stock_movements.movement_id))
            .limit(limit);

        return NextResponse.json(
            rows.map((row) => ({
                ...row,
                quantity: Number(row.quantity),
                balance_after: Number(row.balance_after),
            })),
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("Failed to fetch stock movements:", error);
        const { message, status } = toReadErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}
