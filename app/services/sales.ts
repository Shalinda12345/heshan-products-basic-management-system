import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "../db";
import { products, sales, sale_items, users } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { parseLocalDate } from "../lib/dates";
import { formatMoney, formatQty } from "../lib/format";
import { requiredText } from "../lib/validation";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { findProduct } from "./products";
import { applyStockMovement } from "./stockLedger";

// Only posted invoices count in totals and reports; voided ones are kept for the record
export const postedSale = eq(sales.status, "posted");

// Voids an invoice: puts what is left on it back into stock and takes it out of every total.
// The invoice stays on file, marked void, with the reason and who voided it.
export async function voidSale(actor: Actor, saleId: number, reasonInput: unknown, info: RequestInfo) {
    const reason = requiredText(reasonInput, "A reason for voiding");
    if (reason.length < 3) throw new RequestError("Please give a short reason for voiding this invoice.");

    return db.transaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.sale_id, saleId)).for("update");
        if (!sale) throw new RequestError(`Invoice #${saleId} not found.`, 404);
        if (sale.status === "void") throw new RequestError(`Invoice #${saleId} is already void.`, 409);

        const items = await tx.select().from(sale_items).where(eq(sale_items.sale_id, saleId)).for("update");
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const restored: { product_name: string; quantity: number }[] = [];
        for (const item of items) {
            const quantity = Number(item.quantity);
            if (quantity <= 0) continue; // fully returned already
            let product = item.product_id ? await findProduct(tx, Number(item.product_id)) : null;
            if (!product) {
                const [byName] = await tx.select({ product_id: products.product_id }).from(products).where(eq(products.product_name, item.product_name)).limit(1);
                product = byName ? await findProduct(tx, Number(byName.product_id)) : null;
            }
            if (!product) {
                throw new RequestError(`Cannot put "${item.product_name}" back into stock: the product no longer exists.`, 409);
            }
            await applyStockMovement(tx, {
                productId: product.product_id,
                productName: product.product_name,
                movementType: "sale_void",
                quantity,
                movementDate: today,
                reference: `Sale #${saleId}`,
                note: `Invoice voided: ${reason}`.slice(0, 255),
                createdBy: actor.id,
            });
            restored.push({ product_name: product.product_name, quantity });
        }

        await tx.update(sales)
            .set({ status: "void", void_reason: reason.slice(0, 255), voided_at: new Date(), voided_by: actor.id })
            .where(eq(sales.sale_id, saleId));

        await logActivity(tx, actor, {
            action: "sale.void",
            summary: `Voided invoice #${saleId} (${sale.customer_name}, ${formatMoney(Number(sale.grand_total))}): ${reason}`
                + (restored.length ? `. Returned to stock: ${restored.map((r) => `${formatQty(r.quantity)} × ${r.product_name}`).join(", ")}` : ""),
            entityType: "sale",
            entityId: saleId,
            details: {
                reason,
                customer: sale.customer_name,
                grand_total: Number(sale.grand_total),
                restored_to_stock: restored,
            },
        }, info);

        return { sale_id: saleId, restored };
    });
}

export interface InvoiceFilters {
    from?: string | null;
    to?: string | null;
    customerId?: number | null;
    status?: "posted" | "void" | null;
    search?: string | null;
    page: number;
    pageSize: number;
}

const createdByUser = alias(users, "created_by_user");
const voidedByUser = alias(users, "voided_by_user");

// The invoice register: one page of invoices, newest first, with the total of the posted ones across all pages
export async function listInvoices(filters: InvoiceFilters) {
    const where: SQL[] = [];
    if (filters.from) where.push(gte(sales.sale_date, parseLocalDate(filters.from)));
    if (filters.to) where.push(lte(sales.sale_date, parseLocalDate(filters.to)));
    if (filters.customerId) where.push(eq(sales.customer_id, filters.customerId));
    if (filters.status) where.push(eq(sales.status, filters.status));
    const search = filters.search?.trim().replace(/^#/, "");
    if (search) {
        const asId = Number(search);
        where.push(Number.isInteger(asId) && asId > 0
            ? eq(sales.sale_id, asId)
            : sql`${sales.customer_name} LIKE ${`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
    }
    const condition = where.length ? and(...where) : undefined;

    const [rows, [summary]] = await Promise.all([
        db.select({
            sale_id: sales.sale_id,
            sale_date: sql<string>`DATE_FORMAT(${sales.sale_date}, '%Y-%m-%d')`,
            customer_id: sales.customer_id,
            customer_name: sales.customer_name,
            grand_total: sales.grand_total,
            status: sales.status,
            void_reason: sales.void_reason,
            voided_at: sales.voided_at,
            voided_by: voidedByUser.name,
            created_by: createdByUser.name,
            created_at: sales.created_at,
            item_count: sql<number>`(SELECT COUNT(*) FROM ${sale_items} WHERE ${sale_items.sale_id} = ${sales.sale_id})`,
        })
            .from(sales)
            .leftJoin(createdByUser, eq(createdByUser.id, sales.created_by))
            .leftJoin(voidedByUser, eq(voidedByUser.id, sales.voided_by))
            .where(condition)
            .orderBy(desc(sales.sale_date), desc(sales.sale_id))
            .limit(filters.pageSize)
            .offset((filters.page - 1) * filters.pageSize),
        db.select({
            count: sql<number>`COUNT(*)`,
            posted_count: sql<number>`COALESCE(SUM(CASE WHEN ${sales.status} = 'posted' THEN 1 ELSE 0 END), 0)`,
            posted_total: sql<number>`COALESCE(SUM(CASE WHEN ${sales.status} = 'posted' THEN ${sales.grand_total} ELSE 0 END), 0)`,
        }).from(sales).where(condition),
    ]);

    return {
        rows: rows.map((row) => ({
            ...row,
            sale_id: Number(row.sale_id),
            grand_total: Number(row.grand_total),
            item_count: Number(row.item_count),
        })),
        total: Number(summary.count),
        page: filters.page,
        page_size: filters.pageSize,
        totals: { posted_count: Number(summary.posted_count), posted_amount: Math.round(Number(summary.posted_total) * 100) / 100 },
    };
}
