import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { sales, sale_items } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { parseLocalDate, startOfDay } from "../lib/dates";
import { formatMoney, formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { likeContains } from "../lib/validation";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { createdByUser, postedTotals, voidedByUser, voidedColumns, voidReason } from "./documents";
import { findProduct, findProductByName } from "./products";
import { applyStockMovement } from "./stockLedger";

// Only posted invoices count in totals and reports; voided ones are kept for the record
export const postedSale = eq(sales.status, "posted");

// The posted invoices dated from `start` to `end`, newest first (the daily, weekly and monthly sales pages)
export function postedSalesBetween(start: Date, end: Date) {
    return db
        .select()
        .from(sales)
        .where(and(gte(sales.sale_date, start), lte(sales.sale_date, end), postedSale))
        .orderBy(desc(sales.sale_date));
}

// Voids an invoice: puts what is left on it back into stock and takes it out of every total.
// The invoice stays on file, marked void, with the reason and who voided it.
export async function voidSale(actor: Actor, saleId: number, reasonInput: unknown, info: RequestInfo) {
    const reason = voidReason(reasonInput, "invoice");

    return db.transaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.sale_id, saleId)).for("update");
        if (!sale) throw new RequestError(`Invoice #${saleId} not found.`, 404);
        if (sale.status === "void") throw new RequestError(`Invoice #${saleId} is already void.`, 409);

        const items = await tx.select().from(sale_items).where(eq(sale_items.sale_id, saleId)).for("update");

        const restored: { product_name: string; quantity: number }[] = [];
        for (const item of items) {
            const quantity = Number(item.quantity);
            if (quantity <= 0) continue; // fully returned already
            const product = (item.product_id ? await findProduct(tx, Number(item.product_id)) : null)
                ?? await findProductByName(tx, item.product_name);
            if (!product) {
                throw new RequestError(`Cannot put "${item.product_name}" back into stock: the product no longer exists.`, 409);
            }
            await applyStockMovement(tx, {
                productId: product.product_id,
                productName: product.product_name,
                movementType: "sale_void",
                quantity,
                movementDate: startOfDay(),
                reference: `Sale #${saleId}`,
                note: `Invoice voided: ${reason}`.slice(0, 255),
                createdBy: actor.id,
            });
            restored.push({ product_name: product.product_name, quantity });
        }

        await tx.update(sales).set(voidedColumns(actor, reason)).where(eq(sales.sale_id, saleId));

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
            : sql`${sales.customer_name} LIKE ${likeContains(search)}`);
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
        db.select(postedTotals(postedSale, sales.grand_total)).from(sales).where(condition),
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
        totals: { posted_count: Number(summary.posted_count), posted_amount: roundMoney(Number(summary.posted_total)) },
    };
}
