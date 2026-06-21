import { db } from "../db";
import { sales, sale_items } from "../db/schema";

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

        return { sale_id: newSaleId };
    });
}