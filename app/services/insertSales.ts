import { asc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "../db";
import { products, sales, sale_items } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { formatMoney, formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { parseLocalDate } from "../lib/dates";
import { applyStockMovement } from "./stockLedger";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { findCustomer, findCustomerByName } from "./customers";
import { findProduct, type Product } from "./products";

interface SaleItemInput{
    product_id?: number;
    product_name: string;
    quantity: number;
    selling_price: number;
    total?: number; // ignored: recomputed from quantity × selling_price
}

interface CreateSaleInput{
    customer_id?: number;
    customer_name: string;
    sale_date: string;
    grand_total?: number; // ignored: recomputed from the line totals
    items: SaleItemInput[];
}

async function productByName(executor: DbExecutor, name: string): Promise<Product | null> {
    const [row] = await executor.select({ product_id: products.product_id }).from(products)
        .where(eq(products.product_name, name)).orderBy(asc(products.product_id)).limit(1);
    return row ? findProduct(executor, Number(row.product_id)) : null;
}

export async function InsertSales(data: CreateSaleInput, actor: Actor | null = null, info?: RequestInfo) {
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
        product_id: Number(item.product_id) > 0 ? Number(item.product_id) : null,
        product_name: item.product_name.trim(),
        quantity: Number(item.quantity),
        selling_price: Number(item.selling_price),
        total: roundMoney(Number(item.quantity) * Number(item.selling_price)),
    }));
    const grandTotal = roundMoney(itemRows.reduce((sum, item) => sum + item.total, 0));

    return await db.transaction(async (tx) => {
        // The customer must be on the customer list (and still active)
        const customerName = data.customer_name.trim();
        const customer = Number(data.customer_id) > 0
            ? await findCustomer(tx, Number(data.customer_id))
            : await findCustomerByName(tx, customerName);
        if (!customer) {
            throw new RequestError(`Customer "${customerName}" not found. Add them to the customer list first.`);
        }
        if (!customer.is_active) {
            throw new RequestError(`Customer "${customer.customer_name}" is inactive. Reactivate them before invoicing.`);
        }

        // Each line's product, found by id when the form sent one
        const lines: (typeof itemRows[number] & { product: Product })[] = [];
        for (const item of itemRows) {
            const product = item.product_id ? await findProduct(tx, item.product_id) : await productByName(tx, item.product_name);
            if (!product) {
                throw new Error(
                    `Product "${item.product_name}" not found in the products table. Stock deduction aborted.`
                );
            }
            if (!product.is_active) {
                throw new RequestError(`Product "${product.product_name}" is no longer sold (inactive).`);
            }
            lines.push({ ...item, product_id: product.product_id, product_name: product.product_name, product });
        }

        const [SaleResult] = await tx.insert(sales).values({
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            sale_date: saleDateObj,
            grand_total: grandTotal,
            created_by: actor?.id ?? null,
        });

        const newSaleId = SaleResult.insertId;

        const itemsPayload = lines.map(({ product_id, product_name, quantity, selling_price, total }) => ({
            sale_id: newSaleId, product_id, product_name, quantity, selling_price, total,
        }));

        await tx.insert(sale_items).values(itemsPayload);

        // Deduct each line from stock and log it in the stock ledger
        for (const item of lines) {
            await applyStockMovement(tx, {
                productId: item.product.product_id,
                productName: item.product.product_name,
                movementType: "sale",
                quantity: item.quantity,
                movementDate: saleDateObj,
                reference: `Sale #${newSaleId}`,
                note: customer.customer_name,
                createdBy: actor?.id ?? null,
                messages: {
                    noStockRow: `No stock record found for "${item.product_name}". Cannot sell a product with no stock.`,
                    insufficient: (available) =>
                        `Insufficient stock for "${item.product_name}". Available: ${available}, Requested: ${item.quantity}`,
                },
            });
        }

        await logActivity(tx, actor, {
            action: "sale.create",
            summary: `Posted invoice #${newSaleId} for ${customer.customer_name}: ${formatMoney(grandTotal)} (${lines.map((l) => `${formatQty(l.quantity)} × ${l.product_name}`).join(", ")})`,
            entityType: "sale",
            entityId: newSaleId,
            details: {
                customer: customer.customer_name,
                sale_date: data.sale_date,
                grand_total: grandTotal,
                items: lines.map(({ product_name, quantity, selling_price, total }) => ({ product_name, quantity, selling_price, total })),
            },
        }, info);

        return { sale_id: newSaleId };
    });
}
