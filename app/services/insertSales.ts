import { db } from "../db";
import { sales, sale_items, products } from "../db/schema";
import { eq } from "drizzle-orm";
import { roundMoney } from "../lib/money";
import { parseLocalDate } from "../lib/dates";
import { applyStockMovement } from "./stockLedger";

interface SaleItemInput{
    product_name: string;
    quantity: number;
    selling_price: number;
    total?: number; // ignored: recomputed from quantity × selling_price
}

interface CreateSaleInput{
    customer_name: string;
    sale_date: string;
    grand_total?: number; // ignored: recomputed from the line totals
    items: SaleItemInput[];
}

export async function InsertSales(data: CreateSaleInput) {
    if (!data.customer_name || !data.customer_name.trim()) {
        throw new Error("Customer name is required.");
    }

    if (!data.sale_date) {
        throw new Error("Sale date is required.");
    }

    if (!data.items || data.items.length === 0) {
        throw new Error("Invoice must contain at least one item.");
    }

    for (const item of data.items) {
        if (!item.product_name || !item.product_name.trim()) {
            throw new Error("Product name is required for all sale items.");
        }
        if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
            throw new Error(`Quantity must be greater than 0 for "${item.product_name}".`);
        }
        if (item.selling_price === undefined || !Number.isFinite(Number(item.selling_price)) || Number(item.selling_price) < 0) {
            throw new Error(`Selling price cannot be negative for "${item.product_name}".`);
        }
    }

    const saleDateObj = parseLocalDate(data.sale_date);

    // Line totals and the grand total are derived here rather than trusted from the client
    const itemRows = data.items.map((item) => ({
        product_name: item.product_name.trim(),
        quantity: Number(item.quantity),
        selling_price: Number(item.selling_price),
        total: roundMoney(Number(item.quantity) * Number(item.selling_price)),
    }));
    const grandTotal = roundMoney(itemRows.reduce((sum, item) => sum + item.total, 0));

    return await db.transaction(async (tx) => {
        const [SaleResult] = await tx.insert(sales).values({
            customer_name: data.customer_name.trim(),
            sale_date: saleDateObj,
            grand_total: grandTotal,
        });

        const newSaleId = SaleResult.insertId;

        const itemsPayload = itemRows.map((item) => ({ sale_id: newSaleId, ...item }));

        await tx.insert(sale_items).values(itemsPayload);

        // Deduct each line from stock and log it in the stock ledger
        for (const item of itemRows) {
            const [prod] = await tx.select()
                .from(products)
                .where(eq(products.product_name, item.product_name));

            if (!prod) {
                throw new Error(
                    `Product "${item.product_name}" not found in the products table. Stock deduction aborted.`
                );
            }

            await applyStockMovement(tx, {
                productId: prod.product_id,
                productName: prod.product_name,
                movementType: "sale",
                quantity: item.quantity,
                movementDate: saleDateObj,
                reference: `Sale #${newSaleId}`,
                note: data.customer_name.trim(),
                messages: {
                    noStockRow: `No stock record found for "${item.product_name}". Cannot sell a product with no stock.`,
                    insufficient: (available) =>
                        `Insufficient stock for "${item.product_name}". Available: ${available}, Requested: ${item.quantity}`,
                },
            });
        }

        return { sale_id: newSaleId };
    });
}