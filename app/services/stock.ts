import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { products, stocks, stock_movements } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { isIsoDate, parseLocalDate, startOfDay, toIsoDate } from "../lib/dates";
import { formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { MANUAL_MOVEMENT_TYPES, MOVEMENT_TYPES, movementLabel, type MovementType, type StockDirection } from "../lib/stock";
import { isoDate, optionalText, positiveId } from "../lib/validation";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { findProduct } from "./products";
import { applyStockMovement } from "./stockLedger";

// Every product with its current level and today's movement totals (unit costs only when `showCost`)
export async function listStockLevels(showCost: boolean) {
    const [levels, todayTotals] = await Promise.all([
        db.select({
            product_id: products.product_id,
            product_name: products.product_name,
            description: products.description,
            unit_price: products.unit_price,
            unit_cost: products.unit_cost,
            reorder_level: products.reorder_level,
            is_active: products.is_active,
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
            .where(and(eq(stock_movements.movement_date, startOfDay()), ne(stock_movements.movement_type, "opening_balance")))
            .groupBy(stock_movements.product_id),
    ]);

    const totalsByProduct = new Map(todayTotals.map((row) => [row.product_id, row]));
    const num = (v: number | null) => (v === null || v === undefined ? null : Number(v));

    return levels.map((row) => {
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
            unit_price: num(row.unit_price),
            unit_cost: showCost ? num(row.unit_cost) : null,
            reorder_level: num(row.reorder_level),
            is_active: row.is_active,
        };
    });
}

export interface StockMovementRequest {
    product_id?: unknown;
    quantity?: unknown;
    direction?: unknown;
    movement_type?: unknown;
    note?: unknown;
    movement_date?: unknown;
}

// Stock moved in or out by hand (production, purchases, damage, internal use...), with its ledger row and log entry
export async function recordStockMovement(actor: Actor, input: StockMovementRequest, info: RequestInfo) {
    const productId = Number(input.product_id);
    const quantity = Number(input.quantity);
    const direction: StockDirection = String(input.direction ?? "IN").toUpperCase() === "OUT" ? "OUT" : "IN";

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new RequestError("Product ID and a positive quantity are required.");
    }
    if (input.direction !== undefined && !["IN", "OUT"].includes(String(input.direction).toUpperCase())) {
        throw new RequestError('Direction must be "IN" or "OUT".');
    }

    const movementType = (input.movement_type ?? MANUAL_MOVEMENT_TYPES[direction][0]) as MovementType;
    if (!MANUAL_MOVEMENT_TYPES[direction].includes(movementType)) {
        const allowed = MANUAL_MOVEMENT_TYPES[direction].map((type) => `"${type}"`).join(", ");
        throw new RequestError(`Movement type for stock ${direction === "IN" ? "in" : "out"} must be one of ${allowed}.`);
    }

    const dateInput = input.movement_date;
    if (dateInput !== undefined && dateInput !== "" && !isIsoDate(dateInput)) {
        throw new RequestError("Movement date must be a valid YYYY-MM-DD date.");
    }
    const movementDate = isIsoDate(dateInput) ? parseLocalDate(dateInput) : startOfDay();
    if (movementDate.getTime() > Date.now()) throw new RequestError("Movement date cannot be in the future.");

    const note = typeof input.note === "string" ? input.note.trim().slice(0, 255) : null;

    const product = await findProduct(db, productId);
    if (!product) throw new RequestError(`Product ID ${productId} not found.`, 404);
    // Inactive products can still be counted or have stock removed, but not received
    if (direction === "IN" && !product.is_active) {
        throw new RequestError(`"${product.product_name}" is inactive. Reactivate it on the Products page before receiving stock.`);
    }

    const movement = await db.transaction(async (tx) => {
        const result = await applyStockMovement(tx, {
            productId,
            productName: product.product_name,
            movementType,
            quantity,
            movementDate,
            reference: "Manual entry",
            note,
            createdBy: actor.id,
        });
        await logActivity(tx, actor, {
            action: "stock.movement",
            summary: `Stock ${direction === "IN" ? "in" : "out"}: ${direction === "IN" ? "+" : "−"}${formatQty(quantity)} ${product.product_name} (${movementLabel(movementType)}), balance ${formatQty(result.balance)}${note ? `. Note: ${note}` : ""}`,
            entityType: "product",
            entityId: productId,
            details: { movement_id: result.movementId, direction, movement_type: movementType, quantity, balance_after: result.balance, movement_date: toIsoDate(movementDate), note },
        }, info);
        return result;
    });

    return {
        product_id: productId,
        quantity: movement.balance,
        movement_id: movement.movementId,
        direction: MOVEMENT_TYPES[movementType].direction,
        movement_type: movementType,
    };
}

export interface StockCountRequest {
    product_id?: unknown;
    counted_quantity?: unknown;
    note?: unknown;
    movement_date?: unknown;
}

// Sets a product's stock to a physical count, recording the difference as a count correction (+ or −)
export async function countStock(actor: Actor, input: StockCountRequest, info: RequestInfo) {
    const productId = positiveId(input.product_id, "product");
    const counted = Number(input.counted_quantity);
    if (input.counted_quantity === undefined || input.counted_quantity === null || input.counted_quantity === ""
        || !Number.isFinite(counted) || counted < 0) {
        throw new RequestError("Counted quantity must be a number of 0 or more.");
    }
    const note = optionalText(input.note, "Note");
    const date = input.movement_date ? isoDate(input.movement_date, "Count date") : toIsoDate(new Date());
    const movementDate = parseLocalDate(date);
    if (movementDate.getTime() > Date.now()) throw new RequestError("Count date cannot be in the future.");

    return db.transaction(async (tx) => {
        const product = await findProduct(tx, productId);
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
        }, info);

        return { product_id: productId, before, counted, difference, movement_id: movementId };
    });
}
