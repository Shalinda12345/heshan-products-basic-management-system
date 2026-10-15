import { db } from "../db";
import { sales, sale_items } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { formatMoney, formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { isIsoDate, parseLocalDate } from "../lib/dates";
import { AMOUNT_LIMIT } from "../lib/validation";
import { applyStockMovement } from "./stockLedger";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { findCustomer, findCustomerByName } from "./customers";
import { findProduct, findProductByName, type Product } from "./products";

interface SaleItemInput {
    product_id?: number;
    product_name: string;
    quantity: number;
    selling_price: number;
    total?: number; // ignored: recomputed from quantity × selling_price
}

export interface CreateSaleInput {
    customer_id?: number;
    customer_name: string;
    sale_date: string;
    grand_total?: number; // ignored: recomputed from the line totals
    items: SaleItemInput[];
}

export async function InsertSales(data: CreateSaleInput, actor: Actor | null = null, info?: RequestInfo) {
    if (typeof data.customer_name !== "string" || !data.customer_name.trim()) {
        throw new RequestError("Customer name is required.");
    }

    if (!data.sale_date) {
        throw new RequestError("Sale date is required.");
    }
    if (!isIsoDate(data.sale_date)) {
        throw new RequestError("Sale date must be a valid date (YYYY-MM-DD).");
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new RequestError("Invoice must contain at least one item.");
    }

    for (const item of data.items as unknown[]) {
        const line = (item ?? {}) as Partial<SaleItemInput>;
        if (typeof line.product_name !== "string" || !line.product_name.trim()) {
            throw new RequestError("Product name is required for all sale items.");
        }
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new RequestError(`Quantity must be greater than 0 for "${line.product_name}".`);
        }
        const price = Number(line.selling_price);
        if (line.selling_price === undefined || line.selling_price === null || !Number.isFinite(price) || price < 0) {
            throw new RequestError(`Selling price cannot be negative for "${line.product_name}".`);
        }
        // The amount columns hold values below AMOUNT_LIMIT
        if (quantity >= AMOUNT_LIMIT || price >= AMOUNT_LIMIT || roundMoney(quantity * price) >= AMOUNT_LIMIT) {
            throw new RequestError(`The quantity or price of "${line.product_name}" is too large.`);
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
    if (grandTotal >= AMOUNT_LIMIT) throw new RequestError("The invoice total is too large.");

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
            const product = item.product_id ? await findProduct(tx, item.product_id) : await findProductByName(tx, item.product_name);
            if (!product) {
                throw new RequestError(`Product "${item.product_name}" not found in the products table. Stock deduction aborted.`);
            }
            if (!product.is_active) {
                throw new RequestError(`Product "${product.product_name}" is no longer sold (inactive).`);
            }
            // Returns and voids work on one line per product, so a product appears on an invoice once
            if (lines.some((line) => line.product_id === product.product_id)) {
                throw new RequestError(`"${product.product_name}" is on the invoice more than once. Put it on one line with the total quantity.`);
            }
            lines.push({ ...item, product_id: product.product_id, product_name: product.product_name, product });
        }

        const [saleResult] = await tx.insert(sales).values({
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            sale_date: saleDateObj,
            grand_total: grandTotal,
            created_by: actor?.id ?? null,
        });

        const newSaleId = saleResult.insertId;

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
