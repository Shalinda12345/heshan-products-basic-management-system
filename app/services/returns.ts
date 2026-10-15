import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, type DbTransaction } from "../db";
import { expenses, products, returns, sales, sale_items, stocks } from "../db/schema";
import { RequestError } from "../lib/api-error";
import { isIsoDate, isoDateFromDb, parseLocalDate, startOfDay } from "../lib/dates";
import { formatMoney, formatQty } from "../lib/format";
import { roundMoney } from "../lib/money";
import { RETURN_TYPES, isReturnType, returnTypeLabel, type ReturnType } from "../lib/returns";
import { AMOUNT_LIMIT } from "../lib/validation";
import { logActivity, type Actor, type RequestInfo } from "./activity";
import { createdByUser, voidedByUser, voidedColumns, voidReason } from "./documents";
import { postedExpense } from "./expenses";
import { findProduct } from "./products";
import { applyStockMovement } from "./stockLedger";

// Only posted returns count in totals and reports; voided ones are kept for the record
export const postedReturn = eq(returns.status, "posted");

function isPositive(value: unknown): boolean {
    return Number.isFinite(Number(value)) && Number(value) > 0;
}

// Quantities, rates and totals are stored as DOUBLE(10,2), which holds values below AMOUNT_LIMIT
function assertStorable(...values: number[]) {
    if (values.some((value) => value >= AMOUNT_LIMIT)) throw new RequestError("The quantity or amount is too large.");
}

export interface ReturnInput {
    return_type?: unknown;
    // For stock-based returns (stock_expense_return, sale_reduction_return)
    product_id?: unknown;
    product_name?: unknown;
    quantity?: unknown;
    per_unit_amount?: unknown;
    expense_date?: unknown;
    // For sale-reduction returns (sale_reduction_return, sale_reduction_expense_return)
    sale_id?: unknown;
    sale_product_name?: unknown;
    sale_quantity?: unknown;
    sale_per_unit_amount?: unknown;
    // Custom expense rate for sale_reduction_expense_return
    expense_per_unit_amount?: unknown;
}

export interface ReturnResult {
    message: string;
    return_id: number;
    expense_item_id?: number;
    sale_id?: number;
}

// Locks a posted invoice and the line for one of its products, for changing both together
async function lockSaleLine(tx: DbTransaction, saleId: number, productName: string) {
    // Sale and line rows are locked until commit so concurrent returns can't over-return
    const [currentSale] = await tx.select().from(sales).where(eq(sales.sale_id, saleId)).for("update");
    if (!currentSale) throw new RequestError(`Sale ID ${saleId} not found.`);
    if (currentSale.status === "void") throw new RequestError(`Sale #${saleId} has been voided, so it can't take returns.`);

    const [saleItem] = await tx
        .select()
        .from(sale_items)
        .where(eq(sale_items.sale_id, saleId))
        .for("update")
        .then((rows) => rows.filter((r) => r.product_name === productName));
    if (!saleItem) throw new RequestError(`No sale item matching "${productName}" found in Sale #${saleId}.`);

    return { currentSale, saleItem };
}

// Takes `returnQty` units worth `returnLineTotal` off an invoice line and the invoice total
async function reduceSale(tx: DbTransaction, saleId: number, productName: string, returnQty: number, unitPrice: number) {
    const { currentSale, saleItem } = await lockSaleLine(tx, saleId, productName);

    const existingQty = Number(saleItem.quantity);
    if (returnQty > existingQty) {
        throw new RequestError(`Cannot return ${returnQty} units — only ${existingQty} were sold in this transaction.`);
    }

    const returnLineTotal = roundMoney(returnQty * unitPrice);
    if (returnLineTotal > Number(saleItem.total)) {
        throw new RequestError(`Return amount Rs. ${returnLineTotal.toFixed(2)} exceeds the Rs. ${Number(saleItem.total).toFixed(2)} remaining for "${productName}" in Sale #${saleId}.`);
    }

    const newSaleItemQty = Math.max(0, existingQty - returnQty);
    const newSaleItemTotal = Math.max(0, roundMoney(Number(saleItem.total) - returnLineTotal));
    const newGrandTotal = Math.max(0, roundMoney(Number(currentSale.grand_total) - returnLineTotal));

    await tx.update(sale_items)
        .set({ quantity: newSaleItemQty, total: newSaleItemTotal })
        .where(eq(sale_items.sale_detail_id, saleItem.sale_detail_id));
    await tx.update(sales)
        .set({ grand_total: newGrandTotal })
        .where(eq(sales.sale_id, saleId));

    return { returnLineTotal, customerName: currentSale.customer_name };
}

// Processes one of the three kinds of return in a single transaction, with its audit row and log entry
export async function createReturn(input: ReturnInput, actor: Actor | null, info?: RequestInfo): Promise<ReturnResult> {
    const { return_type, product_id, product_name, quantity, per_unit_amount, expense_date,
        sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, expense_per_unit_amount } = input;

    // Totals are always derived from quantity × per-unit amount; client-sent totals are ignored
    if (!isReturnType(return_type)) throw new RequestError("Invalid or missing return_type.");
    if (!expense_date) throw new RequestError("expense_date is required.");
    if (!isIsoDate(expense_date)) throw new RequestError("expense_date must be a valid date (YYYY-MM-DD).");

    const parsedDate = parseLocalDate(expense_date);
    const createdBy = actor?.id ?? null;

    // ── Stock expense return: reduce stock and record an expense ──────────────
    if (return_type === "stock_expense_return") {
        if (!isPositive(product_id) || !product_name || !isPositive(quantity) || !isPositive(per_unit_amount)) {
            throw new RequestError("product_id, product_name, quantity, and per_unit_amount are required for Stock Expense Return.");
        }
        const qty = Number(quantity);
        const rate = Number(per_unit_amount);
        const returnTotal = roundMoney(qty * rate);
        assertStorable(qty, rate, returnTotal);

        return db.transaction(async (tx) => {
            // Stock is taken from product_id, so the records name that product (not whatever name was sent)
            const product = Number.isInteger(Number(product_id)) ? await findProduct(tx, Number(product_id)) : null;
            if (!product) throw new RequestError(`No stock record found for product ID ${product_id}.`);
            const productName = product.product_name;

            const [expenseResult] = await tx.insert(expenses).values({
                expense_name: `Stock Expense Return: ${productName}`,
                quantity: qty,
                per_expense_amount: rate,
                total: returnTotal,
                expense_date: parsedDate,
                created_by: createdBy,
            });
            const newExpenseId = Number(expenseResult.insertId);

            // Deduct stock (validated and locked) and log it in the stock ledger
            const movement = await applyStockMovement(tx, {
                productId: product.product_id,
                productName,
                movementType: "write_off",
                quantity: qty,
                movementDate: parsedDate,
                reference: `Expense #${newExpenseId}`,
                createdBy,
                messages: {
                    noStockRow: `No stock record found for product ID ${product_id}.`,
                    insufficient: (available) => `Insufficient stock. Available: ${available}, requested: ${quantity}.`,
                },
            });

            const [returnResult] = await tx.insert(returns).values({
                return_type,
                product_name: productName,
                quantity: qty,
                per_unit_amount: rate,
                total: returnTotal,
                stock_id: movement.stockId,
                expense_item_id: newExpenseId,
                return_date: parsedDate,
                created_by: createdBy,
            });
            const returnId = Number(returnResult.insertId);

            await logActivity(tx, actor, {
                action: "return.create",
                summary: `Return #${returnId} (${RETURN_TYPES[return_type].label}): wrote off ${formatQty(qty)} × ${productName}, expense ${formatMoney(returnTotal)}`,
                entityType: "return",
                entityId: returnId,
                details: { return_type, product_name: productName, quantity: qty, per_unit_amount: rate, total: returnTotal, expense_item_id: newExpenseId, return_date: String(expense_date) },
            }, info);

            return { message: "Stock Expense Return processed.", return_id: returnId, expense_item_id: newExpenseId };
        });
    }

    if (!isPositive(sale_id) || typeof sale_product_name !== "string" || !sale_product_name || !isPositive(sale_quantity) || !isPositive(sale_per_unit_amount)) {
        throw new RequestError(return_type === "sale_reduction_return"
            ? "sale_id, sale_product_name, sale_quantity, and sale_per_unit_amount are required for Sale Reduction Return."
            : "sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, and expense_per_unit_amount are required for Sale Reduction Expense Return.");
    }
    const saleId = Number(sale_id);
    const saleProduct = sale_product_name;
    const returnQty = Number(sale_quantity);
    const unitPrice = Number(sale_per_unit_amount);
    assertStorable(returnQty, unitPrice, roundMoney(returnQty * unitPrice));

    // ── Sale reduction return: reduce the invoice and credit the goods back to stock ──
    if (return_type === "sale_reduction_return") {
        if (!isPositive(product_id)) {
            throw new RequestError("A stock item must be selected to credit back for Sale Reduction Return.");
        }

        return db.transaction(async (tx) => {
            const { returnLineTotal, customerName } = await reduceSale(tx, saleId, saleProduct, returnQty, unitPrice);

            // Add returned qty BACK to the selected stock and log it in the stock ledger
            const [creditProduct] = await tx.select().from(products).where(eq(products.product_id, Number(product_id)));
            const noStockRow = `No stock record found for product ID ${product_id}.`;
            if (!creditProduct) throw new RequestError(noStockRow);

            const movement = await applyStockMovement(tx, {
                productId: creditProduct.product_id,
                productName: creditProduct.product_name,
                movementType: "sale_return",
                quantity: returnQty,
                movementDate: parsedDate,
                reference: `Sale #${saleId}`,
                note: creditProduct.product_name === saleProduct ? null : `Returned as "${saleProduct}"`,
                requireStockRow: true,
                createdBy,
                messages: { noStockRow },
            });

            const [returnResult] = await tx.insert(returns).values({
                return_type,
                product_name: saleProduct,
                quantity: returnQty,
                per_unit_amount: unitPrice,
                total: returnLineTotal,
                stock_id: movement.stockId,
                sale_id: saleId,
                return_date: parsedDate,
                created_by: createdBy,
            });
            const returnId = Number(returnResult.insertId);

            await logActivity(tx, actor, {
                action: "return.create",
                summary: `Return #${returnId} (${RETURN_TYPES[return_type].label}): ${formatQty(returnQty)} × ${saleProduct} taken off invoice #${saleId} (${customerName}), ${formatMoney(returnLineTotal)}; credited to ${creditProduct.product_name} stock`,
                entityType: "return",
                entityId: returnId,
                details: { return_type, sale_id: saleId, product_name: saleProduct, quantity: returnQty, per_unit_amount: unitPrice, total: returnLineTotal, credited_product: creditProduct.product_name, return_date: String(expense_date) },
            }, info);

            return { message: "Sale Reduction Return processed. Sale reduced and stock credited.", return_id: returnId, sale_id: saleId };
        });
    }

    // ── Sale reduction expense return: reduce the invoice and write the goods off as an expense ──
    if (!isPositive(expense_per_unit_amount)) {
        throw new RequestError("sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, and expense_per_unit_amount are required for Sale Reduction Expense Return.");
    }
    const expenseRate = Number(expense_per_unit_amount);
    assertStorable(expenseRate, roundMoney(returnQty * expenseRate));

    return db.transaction(async (tx) => {
        const { returnLineTotal, customerName } = await reduceSale(tx, saleId, saleProduct, returnQty, unitPrice);
        const expenseTotal = roundMoney(returnQty * expenseRate);

        // Record expense — goods written off using the custom expense rate
        const [expenseResult] = await tx.insert(expenses).values({
            expense_name: `Sale Reduction Expense Return: ${saleProduct}`,
            quantity: returnQty,
            per_expense_amount: expenseRate,
            total: expenseTotal,
            expense_date: parsedDate,
            created_by: createdBy,
        });
        const newExpenseId = Number(expenseResult.insertId);

        const [returnResult] = await tx.insert(returns).values({
            return_type,
            product_name: saleProduct,
            quantity: returnQty,
            per_unit_amount: unitPrice,
            total: returnLineTotal,
            sale_id: saleId,
            expense_item_id: newExpenseId,
            return_date: parsedDate,
            created_by: createdBy,
        });
        const returnId = Number(returnResult.insertId);

        await logActivity(tx, actor, {
            action: "return.create",
            summary: `Return #${returnId} (${RETURN_TYPES[return_type].label}): ${formatQty(returnQty)} × ${saleProduct} taken off invoice #${saleId} (${customerName}), ${formatMoney(returnLineTotal)}; written off as expense ${formatMoney(expenseTotal)}`,
            entityType: "return",
            entityId: returnId,
            details: { return_type, sale_id: saleId, product_name: saleProduct, quantity: returnQty, per_unit_amount: unitPrice, total: returnLineTotal, expense_item_id: newExpenseId, expense_total: expenseTotal, return_date: String(expense_date) },
        }, info);

        return { message: "Sale Reduction Expense Return processed. Sale reduced and expense recorded.", return_id: returnId, expense_item_id: newExpenseId };
    });
}

// ─── Voiding ──────────────────────────────────────────────────────────────────

async function voidLinkedExpense(tx: DbTransaction, expenseId: number, actor: Actor, note: string) {
    await tx.update(expenses)
        .set(voidedColumns(actor, note))
        .where(and(eq(expenses.expense_item_id, expenseId), postedExpense));
}

async function productOfStockRow(tx: DbTransaction, stockId: number | null) {
    if (!stockId) return null;
    const [row] = await tx
        .select({ product_id: products.product_id, product_name: products.product_name })
        .from(stocks)
        .innerJoin(products, eq(products.product_id, stocks.product_id))
        .where(eq(stocks.stock_id, stockId));
    return row ? { product_id: Number(row.product_id), product_name: row.product_name } : null;
}

// Undoes a return: puts back what it changed on the invoice, in stock and in expenses, and marks it void
export async function voidReturn(actor: Actor, returnId: number, reasonInput: unknown, info: RequestInfo) {
    const reason = voidReason(reasonInput, "return");

    return db.transaction(async (tx) => {
        const [ret] = await tx.select().from(returns).where(eq(returns.return_id, returnId)).for("update");
        if (!ret) throw new RequestError(`Return #${returnId} not found.`, 404);
        if (ret.status === "void") throw new RequestError(`Return #${returnId} is already void.`, 409);
        if (!isReturnType(ret.return_type)) throw new RequestError(`Return #${returnId} has an unknown type and can't be voided.`, 409);

        const qty = Number(ret.quantity);
        const note = `Return #${returnId} voided: ${reason}`;
        const effects: string[] = [];

        // Invoice lines reduced by the return get their quantity and amount back
        if (ret.return_type === "sale_reduction_return" || ret.return_type === "sale_reduction_expense_return") {
            if (!ret.sale_id) throw new RequestError(`Return #${returnId} is not linked to an invoice.`, 409);
            const [sale] = await tx.select().from(sales).where(eq(sales.sale_id, ret.sale_id)).for("update");
            if (!sale) throw new RequestError(`Invoice #${ret.sale_id} no longer exists.`, 409);
            if (sale.status === "void") {
                throw new RequestError(`Invoice #${ret.sale_id} has been voided, so its returns can no longer be reversed.`, 409);
            }
            const [line] = await tx.select().from(sale_items)
                .where(and(eq(sale_items.sale_id, ret.sale_id), eq(sale_items.product_name, ret.product_name)))
                .for("update");
            if (!line) throw new RequestError(`Invoice #${ret.sale_id} no longer has a "${ret.product_name}" line.`, 409);

            await tx.update(sale_items)
                .set({ quantity: roundMoney(Number(line.quantity) + qty), total: roundMoney(Number(line.total) + Number(ret.total)) })
                .where(eq(sale_items.sale_detail_id, line.sale_detail_id));
            await tx.update(sales)
                .set({ grand_total: roundMoney(Number(sale.grand_total) + Number(ret.total)) })
                .where(eq(sales.sale_id, ret.sale_id));
            effects.push(`invoice #${ret.sale_id} restored by ${formatMoney(Number(ret.total))}`);
        }

        // Stock moved by the return moves back
        if (ret.return_type === "stock_expense_return" || ret.return_type === "sale_reduction_return") {
            const product = await productOfStockRow(tx, ret.stock_id);
            if (!product) throw new RequestError(`The stock record changed by return #${returnId} no longer exists.`, 409);
            const writeOff = ret.return_type === "stock_expense_return";
            await applyStockMovement(tx, {
                productId: product.product_id,
                productName: product.product_name,
                movementType: writeOff ? "write_off_reversal" : "sale_return_reversal",
                quantity: qty,
                movementDate: startOfDay(),
                reference: `Return #${returnId}`,
                note: reason,
                createdBy: actor.id,
                messages: {
                    insufficient: (available) =>
                        `Cannot reverse return #${returnId}: it put ${formatQty(qty)} × ${product.product_name} into stock, but only ${formatQty(available)} are left.`,
                },
            });
            effects.push(`${formatQty(qty)} × ${product.product_name} ${writeOff ? "back into" : "taken out of"} stock`);
        }

        // Expenses recorded by the return are voided with it
        if (ret.expense_item_id) {
            await voidLinkedExpense(tx, ret.expense_item_id, actor, note);
            effects.push(`expense #${ret.expense_item_id} voided`);
        }

        await tx.update(returns).set(voidedColumns(actor, reason)).where(eq(returns.return_id, returnId));

        await logActivity(tx, actor, {
            action: "return.void",
            summary: `Voided return #${returnId} (${returnTypeLabel(ret.return_type)}, ${formatQty(qty)} × ${ret.product_name}): ${reason}. ${effects.join("; ")}`,
            entityType: "return",
            entityId: returnId,
            details: { reason, return_type: ret.return_type, product_name: ret.product_name, quantity: qty, total: Number(ret.total), sale_id: ret.sale_id, expense_item_id: ret.expense_item_id },
        }, info);

        return { return_id: returnId };
    });
}

// ─── Register ─────────────────────────────────────────────────────────────────

export interface ReturnFilters {
    from?: string | null;
    to?: string | null;
    type?: ReturnType | null;
    status?: "posted" | "void" | null;
    page: number;
    pageSize: number;
}

export async function listReturns(filters: ReturnFilters) {
    const where: SQL[] = [];
    if (filters.from) where.push(gte(returns.return_date, parseLocalDate(filters.from)));
    if (filters.to) where.push(lte(returns.return_date, parseLocalDate(filters.to)));
    if (filters.type) where.push(eq(returns.return_type, filters.type));
    if (filters.status) where.push(eq(returns.status, filters.status));
    const condition = where.length ? and(...where) : undefined;

    const [rows, [summary]] = await Promise.all([
        db.select({
            return_id: returns.return_id,
            return_type: returns.return_type,
            product_name: returns.product_name,
            quantity: returns.quantity,
            per_unit_amount: returns.per_unit_amount,
            total: returns.total,
            sale_id: returns.sale_id,
            expense_item_id: returns.expense_item_id,
            return_date: returns.return_date,
            status: returns.status,
            void_reason: returns.void_reason,
            voided_at: returns.voided_at,
            voided_by: voidedByUser.name,
            created_by: createdByUser.name,
            created_at: returns.created_at,
            customer_name: sales.customer_name,
        })
            .from(returns)
            .leftJoin(sales, eq(sales.sale_id, returns.sale_id))
            .leftJoin(createdByUser, eq(createdByUser.id, returns.created_by))
            .leftJoin(voidedByUser, eq(voidedByUser.id, returns.voided_by))
            .where(condition)
            .orderBy(desc(returns.return_date), desc(returns.return_id))
            .limit(filters.pageSize)
            .offset((filters.page - 1) * filters.pageSize),
        db.select({ count: sql<number>`COUNT(*)` }).from(returns).where(condition),
    ]);

    return {
        rows: rows.map((row) => ({
            ...row,
            return_id: Number(row.return_id),
            quantity: Number(row.quantity),
            per_unit_amount: Number(row.per_unit_amount),
            total: Number(row.total),
            return_date: isoDateFromDb(row.return_date),
        })),
        total: Number(summary.count),
        page: filters.page,
        page_size: filters.pageSize,
    };
}
