import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses, stocks, sales, sale_items, returns } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────
// Return type constants
// ─────────────────────────────────────────────────────────
const RETURN_TYPES = [
    "stock_expense_return",
    "stock_replacement_return",
    "sale_reduction_return",
    "sale_reduction_expense_return",
] as const;

type ReturnType = (typeof RETURN_TYPES)[number];

// ─────────────────────────────────────────────────────────
// POST /api/expenses/save-return-expenses
// ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            return_type,
            // For stock-based returns (stock_expense_return, stock_replacement_return, sale_reduction_return)
            product_id,
            product_name,
            quantity,
            per_unit_amount,
            total,
            expense_date,
            // For sale-reduction returns (sale_reduction_return, sale_reduction_expense_return)
            sale_id,
            sale_product_name,
            sale_quantity,
            sale_per_unit_amount,
            sale_total,
            // Custom expense values for sale_reduction_expense_return
            expense_per_unit_amount,
            expense_total,
        } = body;

        // ── Basic validation ──────────────────────────────
        if (!return_type || !RETURN_TYPES.includes(return_type as ReturnType)) {
            return NextResponse.json(
                { success: false, message: "Invalid or missing return_type." },
                { status: 400 }
            );
        }
        if (!expense_date) {
            return NextResponse.json(
                { success: false, message: "expense_date is required." },
                { status: 400 }
            );
        }

        const parsedDate = new Date(expense_date);

        // ────────────────────────────────────────────────────────────────────
        // CASE 1: stock_expense_return
        //   - Reduce stock quantity
        //   - Record an expense entry
        //   - Insert returns record
        // ────────────────────────────────────────────────────────────────────
        if (return_type === "stock_expense_return") {
            if (!product_id || !product_name || !quantity || quantity <= 0 || per_unit_amount <= 0) {
                return NextResponse.json(
                    { success: false, message: "product_id, product_name, quantity, and per_unit_amount are required for Stock Expense Return." },
                    { status: 400 }
                );
            }

            const result = await db.transaction(async (tx) => {
                // Validate stock availability
                const [currentStock] = await tx
                    .select()
                    .from(stocks)
                    .where(eq(stocks.product_id, Number(product_id)));

                if (!currentStock) throw new Error(`No stock record found for product ID ${product_id}.`);
                if (Number(currentStock.quantity) < Number(quantity)) {
                    throw new Error(`Insufficient stock. Available: ${currentStock.quantity}, requested: ${quantity}.`);
                }

                // Deduct stock
                await tx
                    .update(stocks)
                    .set({ quantity: sql`${stocks.quantity} - ${Number(quantity)}` })
                    .where(eq(stocks.product_id, Number(product_id)));

                // Create expense entry
                const [expenseResult] = await tx.insert(expenses).values({
                    expense_name: `Stock Expense Return: ${product_name}`,
                    quantity: Number(quantity),
                    per_expense_amount: Number(per_unit_amount),
                    total: Number(total),
                    expense_date: parsedDate,
                });

                const newExpenseId = expenseResult.insertId;

                // Insert return record
                await tx.insert(returns).values({
                    return_type: "stock_expense_return",
                    product_name,
                    quantity: Number(quantity),
                    per_unit_amount: Number(per_unit_amount),
                    total: Number(total),
                    stock_id: Number(currentStock.stock_id),
                    expense_item_id: Number(newExpenseId),
                    return_date: parsedDate,
                });

                return { expense_item_id: newExpenseId };
            });

            return NextResponse.json(
                { success: true, message: "Stock Expense Return processed.", ...result },
                { status: 201 }
            );
        }

        // ────────────────────────────────────────────────────────────────────
        // CASE 2: stock_replacement_return
        //   - Reduce stock quantity only (no expense recorded)
        //   - Insert returns record
        // ────────────────────────────────────────────────────────────────────
        if (return_type === "stock_replacement_return") {
            if (!product_id || !product_name || !quantity || quantity <= 0) {
                return NextResponse.json(
                    { success: false, message: "product_id, product_name, and quantity are required for Stock Replacement Return." },
                    { status: 400 }
                );
            }

            const result = await db.transaction(async (tx) => {
                // Validate stock availability
                const [currentStock] = await tx
                    .select()
                    .from(stocks)
                    .where(eq(stocks.product_id, Number(product_id)));

                if (!currentStock) throw new Error(`No stock record found for product ID ${product_id}.`);
                if (Number(currentStock.quantity) < Number(quantity)) {
                    throw new Error(`Insufficient stock. Available: ${currentStock.quantity}, requested: ${quantity}.`);
                }

                // Deduct stock — no expense entry
                await tx
                    .update(stocks)
                    .set({ quantity: sql`${stocks.quantity} - ${Number(quantity)}` })
                    .where(eq(stocks.product_id, Number(product_id)));

                // Insert return record (per_unit_amount and total are 0 for replacement)
                await tx.insert(returns).values({
                    return_type: "stock_replacement_return",
                    product_name,
                    quantity: Number(quantity),
                    per_unit_amount: 0,
                    total: 0,
                    stock_id: Number(currentStock.stock_id),
                    return_date: parsedDate,
                });

                return { stock_id: currentStock.stock_id };
            });

            return NextResponse.json(
                { success: true, message: "Stock Replacement Return processed. Stock reduced, no expense recorded.", ...result },
                { status: 201 }
            );
        }

        // ────────────────────────────────────────────────────────────────────
        // CASE 3: sale_reduction_return
        //   - Reduce the sale's grand_total
        //   - Reduce the matching sale_items row (qty + total)
        //   - Add the returned quantity BACK to a user-selected stock
        //   - Insert returns record
        // ────────────────────────────────────────────────────────────────────
        if (return_type === "sale_reduction_return") {
            if (!sale_id || !sale_product_name || !sale_quantity || sale_quantity <= 0 || sale_per_unit_amount <= 0) {
                return NextResponse.json(
                    { success: false, message: "sale_id, sale_product_name, sale_quantity, and sale_per_unit_amount are required for Sale Reduction Return." },
                    { status: 400 }
                );
            }
            if (!product_id) {
                return NextResponse.json(
                    { success: false, message: "A stock item must be selected to credit back for Sale Reduction Return." },
                    { status: 400 }
                );
            }

            const result = await db.transaction(async (tx) => {
                // Fetch the sale
                const [currentSale] = await tx
                    .select()
                    .from(sales)
                    .where(eq(sales.sale_id, Number(sale_id)));

                if (!currentSale) throw new Error(`Sale ID ${sale_id} not found.`);

                // Fetch the matching sale line item
                const [saleItem] = await tx
                    .select()
                    .from(sale_items)
                    .where(eq(sale_items.sale_id, Number(sale_id)))
                    // Match by product name within this sale
                    .then((rows) => rows.filter((r) => r.product_name === sale_product_name));

                if (!saleItem) throw new Error(`No sale item matching "${sale_product_name}" found in Sale #${sale_id}.`);

                const returnQty = Number(sale_quantity);
                const existingQty = Number(saleItem.quantity);
                if (returnQty > existingQty) {
                    throw new Error(`Cannot return ${returnQty} units — only ${existingQty} were sold in this transaction.`);
                }

                const returnLineTotal = Number(sale_total);

                // Reduce sale_items quantity and total
                await tx
                    .update(sale_items)
                    .set({
                        quantity: sql`${sale_items.quantity} - ${returnQty}`,
                        total: sql`${sale_items.total} - ${returnLineTotal}`,
                    })
                    .where(eq(sale_items.sale_detail_id, saleItem.sale_detail_id));

                // Reduce sales grand_total
                await tx
                    .update(sales)
                    .set({ grand_total: sql`${sales.grand_total} - ${returnLineTotal}` })
                    .where(eq(sales.sale_id, Number(sale_id)));

                // Add returned qty BACK to selected stock
                const [creditStock] = await tx
                    .select()
                    .from(stocks)
                    .where(eq(stocks.product_id, Number(product_id)));

                if (!creditStock) throw new Error(`No stock record found for product ID ${product_id}.`);

                await tx
                    .update(stocks)
                    .set({ quantity: sql`${stocks.quantity} + ${returnQty}` })
                    .where(eq(stocks.product_id, Number(product_id)));

                // Insert return record
                await tx.insert(returns).values({
                    return_type: "sale_reduction_return",
                    product_name: sale_product_name,
                    quantity: returnQty,
                    per_unit_amount: Number(sale_per_unit_amount),
                    total: returnLineTotal,
                    stock_id: Number(creditStock.stock_id),
                    sale_id: Number(sale_id),
                    return_date: parsedDate,
                });

                return { sale_id };
            });

            return NextResponse.json(
                { success: true, message: "Sale Reduction Return processed. Sale reduced and stock credited.", ...result },
                { status: 201 }
            );
        }

        // ────────────────────────────────────────────────────────────────────
        // CASE 4: sale_reduction_expense_return
        //   - Reduce the sale's grand_total
        //   - Reduce the matching sale_items row (qty + total)
        //   - Record an expense entry (goods are written off — no stock credit)
        //   - Insert returns record
        // ────────────────────────────────────────────────────────────────────
        if (return_type === "sale_reduction_expense_return") {
            if (!sale_id || !sale_product_name || !sale_quantity || sale_quantity <= 0 || sale_per_unit_amount <= 0 || !expense_per_unit_amount || expense_per_unit_amount <= 0) {
                return NextResponse.json(
                    { success: false, message: "sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, and expense_per_unit_amount are required for Sale Reduction Expense Return." },
                    { status: 400 }
                );
            }

            const result = await db.transaction(async (tx) => {
                // Fetch the sale
                const [currentSale] = await tx
                    .select()
                    .from(sales)
                    .where(eq(sales.sale_id, Number(sale_id)));

                if (!currentSale) throw new Error(`Sale ID ${sale_id} not found.`);

                // Fetch the matching sale line item
                const [saleItem] = await tx
                    .select()
                    .from(sale_items)
                    .where(eq(sale_items.sale_id, Number(sale_id)))
                    .then((rows) => rows.filter((r) => r.product_name === sale_product_name));

                if (!saleItem) throw new Error(`No sale item matching "${sale_product_name}" found in Sale #${sale_id}.`);

                const returnQty = Number(sale_quantity);
                const existingQty = Number(saleItem.quantity);
                if (returnQty > existingQty) {
                    throw new Error(`Cannot return ${returnQty} units — only ${existingQty} were sold in this transaction.`);
                }

                const returnLineTotal = Number(sale_total);

                // Reduce sale_items quantity and total
                await tx
                    .update(sale_items)
                    .set({
                        quantity: sql`${sale_items.quantity} - ${returnQty}`,
                        total: sql`${sale_items.total} - ${returnLineTotal}`,
                    })
                    .where(eq(sale_items.sale_detail_id, saleItem.sale_detail_id));

                // Reduce sales grand_total
                await tx
                    .update(sales)
                    .set({ grand_total: sql`${sales.grand_total} - ${returnLineTotal}` })
                    .where(eq(sales.sale_id, Number(sale_id)));

                // Record expense — goods written off using the custom expense rate
                const [expenseResult] = await tx.insert(expenses).values({
                    expense_name: `Sale Reduction Expense Return: ${sale_product_name}`,
                    quantity: returnQty,
                    per_expense_amount: Number(expense_per_unit_amount),
                    total: Number(expense_total),
                    expense_date: parsedDate,
                });

                const newExpenseId = expenseResult.insertId;

                // Insert return record
                await tx.insert(returns).values({
                    return_type: "sale_reduction_expense_return",
                    product_name: sale_product_name,
                    quantity: returnQty,
                    per_unit_amount: Number(sale_per_unit_amount),
                    total: returnLineTotal,
                    sale_id: Number(sale_id),
                    expense_item_id: Number(newExpenseId),
                    return_date: parsedDate,
                });

                return { expense_item_id: newExpenseId };
            });

            return NextResponse.json(
                { success: true, message: "Sale Reduction Expense Return processed. Sale reduced and expense recorded.", ...result },
                { status: 201 }
            );
        }

        // Should never reach here given the RETURN_TYPES check at the top
        return NextResponse.json(
            { success: false, message: "Unhandled return_type." },
            { status: 400 }
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to process return:", errorMessage);
        return NextResponse.json(
            { success: false, message: errorMessage },
            { status: 400 }
        );
    }
}
