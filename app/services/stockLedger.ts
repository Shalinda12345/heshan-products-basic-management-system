import { db } from "../db";
import { stocks, stock_movements } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { MOVEMENT_TYPES, type MovementType } from "../lib/stock";
import { roundMoney } from "../lib/money";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface StockMovementInput {
    productId: number;
    productName: string;
    movementType: MovementType;
    quantity: number; // always positive; the movement type decides the direction
    movementDate: Date;
    reference?: string | null;
    note?: string | null;
    // Stock-in normally creates the product's stock row on first use; set this to refuse instead
    requireStockRow?: boolean;
    // Lets callers keep their own wording for validation errors
    messages?: {
        noStockRow?: string;
        insufficient?: (available: number) => string;
    };
}

export interface StockMovementResult {
    stockId: number;
    balance: number;
    movementId: number;
}

// Changes a product's stock level and writes the matching ledger row, inside the caller's transaction.
// The stock row stays locked until the transaction commits, so concurrent movements can't overdraw it.
export async function applyStockMovement(tx: DbTransaction, input: StockMovementInput): Promise<StockMovementResult> {
    const { productId, productName, movementType, quantity } = input;
    const direction = MOVEMENT_TYPES[movementType].direction;
    const noStockRow = input.messages?.noStockRow ?? `No stock record found for "${productName}".`;

    const lockStockRow = async () => {
        const [row] = await tx.select().from(stocks).where(eq(stocks.product_id, productId)).for("update");
        return row;
    };

    if (direction === "OUT") {
        const current = await lockStockRow();
        if (!current) throw new Error(noStockRow);
        const available = Number(current.quantity);
        if (available < quantity) {
            throw new Error(
                input.messages?.insufficient?.(available) ??
                `Insufficient stock for "${productName}". Available: ${available}, Requested: ${quantity}`
            );
        }
        await tx.update(stocks)
            .set({ quantity: sql`${stocks.quantity} - ${quantity}` })
            .where(eq(stocks.product_id, productId));
    } else {
        // Lock-reading a missing row would take a gap lock that deadlocks concurrent first inserts,
        // so only check up front when the row has to exist anyway
        if (input.requireStockRow && !(await lockStockRow())) throw new Error(noStockRow);
        // Insert the first stock row or atomically add to the existing one (product_id is unique)
        await tx.insert(stocks)
            .values({ product_id: productId, quantity })
            .onDuplicateKeyUpdate({ set: { quantity: sql`${stocks.quantity} + ${quantity}` } });
    }

    const current = await lockStockRow();
    const balance = roundMoney(Number(current.quantity));

    const [movement] = await tx.insert(stock_movements).values({
        product_id: productId,
        product_name: productName,
        direction,
        movement_type: movementType,
        quantity,
        balance_after: balance,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        movement_date: input.movementDate,
    });

    return { stockId: Number(current.stock_id), balance, movementId: Number(movement.insertId) };
}
