import { db } from "../db";
import { sales, sale_items, products, stocks } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { roundMoney } from "../lib/money";

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

function parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
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

        // Deduct quantities from stocks
        for (const item of data.items) {
            // Find the product by its name to get its product_id
            const [prod] = await tx.select()
                .from(products)
                .where(eq(products.product_name, item.product_name.trim()));

            if (!prod) {
                throw new Error(
                    `Product "${item.product_name}" not found in the products table. Stock deduction aborted.`
                );
            }

            // Check if a stock record exists for this product. FOR UPDATE locks the row until commit,
            // so concurrent sales can't both pass the availability check and oversell.
            const [existingStock] = await tx.select()
                .from(stocks)
                .where(eq(stocks.product_id, prod.product_id))
                .for("update");

            if (!existingStock) {
                throw new Error(
                    `No stock record found for "${item.product_name}". Cannot sell a product with no stock.`
                );
            }

            // Validate sufficient stock before deducting
            if (Number(existingStock.quantity) < Number(item.quantity)) {
                throw new Error(
                    `Insufficient stock for "${item.product_name}". Available: ${existingStock.quantity}, Requested: ${item.quantity}`
                );
            }

            // Atomically subtract the quantity from stock using SQL
            await tx.update(stocks)
                .set({ quantity: sql`${stocks.quantity} - ${Number(item.quantity)}` })
                .where(eq(stocks.product_id, prod.product_id));
        }

        return { sale_id: newSaleId };
    });
}