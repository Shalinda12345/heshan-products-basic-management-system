import { db } from "../db";
import { sales, sale_items, products, stocks } from "../db/schema";
import { eq } from "drizzle-orm";

interface SaleItemInput{
    product_name: string;
    quantity: number;
    selling_price: number;
    total: number;
}

interface CreateSaleInput{
    customer_name: string;
    sale_date: string;
    grand_total: number;
    items: SaleItemInput[];
}

export async function InsertSales(data:CreateSaleInput) {
    if (!data.items || data.items.length === 0){
        throw new Error("Invoice must contain at least one item.");
    }

    return await db.transaction(async (tx) => {
        const [SaleResult] = await tx.insert(sales).values({
            customer_name: data.customer_name,
            sale_date: new Date(data.sale_date),
            grand_total: data.grand_total,
        });

        const newSaleId = SaleResult.insertId;

        const itemsPayload = data.items.map((item) => ({
            sale_id: newSaleId,
            product_name: item.product_name,
            quantity: item.quantity,
            selling_price: item.selling_price,
            total: item.total,
        }));

        await tx.insert(sale_items).values(itemsPayload);

        // Deduct quantities from stocks
        for (const item of data.items) {
            // Find the product by its name to get its product_id
            const [prod] = await tx.select()
                .from(products)
                .where(eq(products.product_name, item.product_name));

            if (prod) {
                // Check if a stock record already exists for this product
                const [existingStock] = await tx.select()
                    .from(stocks)
                    .where(eq(stocks.product_id, prod.product_id));

                if (existingStock) {
                    // Subtract the quantity from the stock
                    const newQty = Number(existingStock.quantity) - Number(item.quantity);
                    await tx.update(stocks)
                        .set({ quantity: newQty })
                        .where(eq(stocks.product_id, prod.product_id));
                } else {
                    // Create a new stock record with negative quantity
                    await tx.insert(stocks).values({
                        product_id: prod.product_id,
                        quantity: -Number(item.quantity),
                    });
                }
            }
        }

        return { sale_id: newSaleId };
    });
}