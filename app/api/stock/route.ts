import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { products, stocks, stock_movements } from "@/app/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { toErrorResponse } from "@/app/lib/api-error";
import { isIsoDate, parseLocalDate } from "@/app/lib/dates";
import { MANUAL_MOVEMENT_TYPES, MOVEMENT_TYPES, type MovementType, type StockDirection } from "@/app/lib/stock";
import { applyStockMovement } from "@/app/services/stockLedger";

export const dynamic = "force-dynamic";

// GET /api/stock — every product with its current level and today's movement totals
export async function GET() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [levels, todayTotals] = await Promise.all([
            db.select({
                product_id: products.product_id,
                product_name: products.product_name,
                description: products.description,
                quantity: stocks.quantity,
                updated_at: stocks.updated_at,
            })
            .from(products)
            .leftJoin(stocks, eq(products.product_id, stocks.product_id))
            .orderBy(products.product_name),

            // Opening balances are a one-off migration entry, not real activity
            db.select({
                product_id: stock_movements.product_id,
                stock_in: sql<number>`COALESCE(SUM(CASE WHEN ${stock_movements.direction} = 'IN' THEN ${stock_movements.quantity} ELSE 0 END), 0)`,
                stock_out: sql<number>`COALESCE(SUM(CASE WHEN ${stock_movements.direction} = 'OUT' THEN ${stock_movements.quantity} ELSE 0 END), 0)`,
            })
            .from(stock_movements)
            .where(and(eq(stock_movements.movement_date, today), ne(stock_movements.movement_type, "opening_balance")))
            .groupBy(stock_movements.product_id),
        ]);

        const totalsByProduct = new Map(todayTotals.map((row) => [row.product_id, row]));

        return NextResponse.json(levels.map((row) => {
            const totals = totalsByProduct.get(row.product_id);
            return {
                product_id: row.product_id,
                product_name: row.product_name,
                description: row.description,
                // Products without a stock row yet have 0 in stock
                quantity: row.quantity !== null && row.quantity !== undefined ? Number(row.quantity) : 0,
                today_in: Number(totals?.stock_in ?? 0),
                today_out: Number(totals?.stock_out ?? 0),
                updated_at: row.updated_at ?? null,
            };
        }), { headers: { "Cache-Control": "no-store" } });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to fetch stock status: ", errorMessage);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// POST /api/stock — record stock moving in or out by hand
//   { product_id, quantity, direction?: "IN" | "OUT" (default IN), movement_type?, note?, movement_date?: "YYYY-MM-DD" }
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const productId = Number(body.product_id);
        const quantity = Number(body.quantity);
        const direction: StockDirection = String(body.direction ?? "IN").toUpperCase() === "OUT" ? "OUT" : "IN";

        if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
            return NextResponse.json(
                { error: "Product ID and a positive quantity are required." },
                { status: 400 }
            );
        }
        if (body.direction !== undefined && !["IN", "OUT"].includes(String(body.direction).toUpperCase())) {
            return NextResponse.json({ error: 'Direction must be "IN" or "OUT".' }, { status: 400 });
        }

        const movementType = (body.movement_type ?? MANUAL_MOVEMENT_TYPES[direction][0]) as MovementType;
        if (!MANUAL_MOVEMENT_TYPES[direction].includes(movementType)) {
            const allowed = MANUAL_MOVEMENT_TYPES[direction].map((type) => `"${type}"`).join(", ");
            return NextResponse.json(
                { error: `Movement type for stock ${direction === "IN" ? "in" : "out"} must be one of ${allowed}.` },
                { status: 400 }
            );
        }

        if (body.movement_date !== undefined && body.movement_date !== "" && !isIsoDate(body.movement_date)) {
            return NextResponse.json({ error: "Movement date must be a valid YYYY-MM-DD date." }, { status: 400 });
        }
        const movementDate = body.movement_date ? parseLocalDate(body.movement_date) : new Date();
        if (movementDate.getTime() > Date.now()) {
            return NextResponse.json({ error: "Movement date cannot be in the future." }, { status: 400 });
        }
        movementDate.setHours(0, 0, 0, 0);

        const note = typeof body.note === "string" ? body.note.trim().slice(0, 255) : null;

        // Verify product exists in products table
        const [existingProduct] = await db.select()
            .from(products)
            .where(eq(products.product_id, productId));

        if (!existingProduct) {
            return NextResponse.json(
                { error: `Product ID ${productId} not found.` },
                { status: 404 }
            );
        }

        const movement = await db.transaction((tx) =>
            applyStockMovement(tx, {
                productId,
                productName: existingProduct.product_name,
                movementType,
                quantity,
                movementDate,
                reference: "Manual entry",
                note,
            })
        );

        return NextResponse.json({
            success: true,
            data: {
                product_id: productId,
                quantity: movement.balance,
                movement_id: movement.movementId,
                direction: MOVEMENT_TYPES[movementType].direction,
                movement_type: movementType,
            },
        }, { status: 200 });
    } catch (error: unknown) {
        console.error("Failed to record stock movement: ", error);
        const { message, status } = toErrorResponse(error);
        return NextResponse.json({ error: message }, { status });
    }
}
