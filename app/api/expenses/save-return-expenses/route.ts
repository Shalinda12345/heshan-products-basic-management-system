import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses, products, sales, sale_items, returns } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { toErrorResponse } from "@/app/lib/api-error";
import { roundMoney } from "@/app/lib/money";
import { parseLocalDate } from "@/app/lib/dates";
import { applyStockMovement } from "@/app/services/stockLedger";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────
// Return type constants
// ─────────────────────────────────────────────────────────
const RETURN_TYPES = [
    "stock_expense_return",
    "sale_reduction_return",
    "sale_reduction_expense_return",
] as const;

type ReturnType = (typeof RETURN_TYPES)[number];

function isPositive(value: unknown): boolean {
    return Number.isFinite(Number(value)) && Number(value) > 0;
}

// ─────────────────────────────────────────────────────────
// POST /api/expenses/save-return-expenses
// ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        const body = await request.json();
        // Totals are always derived from quantity × per-unit amount; client-sent totals are ignored
        const {
            return_type,
            // For stock-based returns (stock_expense_return, sale_reduction_return)
            product_id,
            product_name,
            quantity,
            per_unit_amount,
            expense_date,
            // For sale-reduction returns (sale_reduction_return, sale_reduction_expense_return)
            sale_id,
            sale_product_name,
            sale_quantity,
            sale_per_unit_amount,
            // Custom expense rate for sale_reduction_expense_return
            expense_per_unit_amount,
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

        const parsedDate = parseLocalDate(expense_date);

        // ────────────────────────────────────────────────────────────────────
        // CASE 1: stock_expense_return
        //   - Reduce stock quantity
        //   - Record an expense entry
        //   - Insert returns record
        // ────────────────────────────────────────────────────────────────────
        if (return_type === "stock_expense_return") {
            if (!isPositive(product_id) || !product_name || !isPositive(quantity) || !isPositive(per_unit_amount)) {
                return NextResponse.json(
                    { success: false, message: "product_id, product_name, quantity, and per_unit_amount are required for Stock Expense Return." },
                    { status: 400 }
                );
            }

            const returnTotal = roundMoney(Number(quantity) * Number(per_unit_amount));

            const result = await db.transaction(async (tx) => {
                // Create expense entry
                const [expenseResult] = await tx.insert(expenses).values({
                    expense_name: `Stock Expense Return: ${product_name}`,
                    quantity: Number(quantity),
                    per_expense_amount: Number(per_unit_amount),
                    total: Number(returnTotal),
                    expense_date: parsedDate,
                });

                const newExpenseId = expenseResult.insertId;

                // Deduct stock (validated and locked) and log it in the stock ledger
                const movement = await applyStockMovement(tx, {
                    productId: Number(product_id),
                    productName: String(product_name),
                    movementType: "write_off",
                    quantity: Number(quantity),
                    movementDate: parsedDate,
                    reference: `Expense #${newExpenseId}`,
                    messages: {
                        noStockRow: `No stock record found for product ID ${product_id}.`,
                        insufficient: (available) => `Insufficient stock. Available: ${available}, requested: ${quantity}.`,
                    },
                });

                // Insert return record
                await tx.insert(returns).values({
                    return_type: "stock_expense_return",
                    product_name,
                    quantity: Number(quantity),
                    per_unit_amount: Number(per_unit_amount),
                    total: Number(returnTotal),
                    stock_id: movement.stockId,
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
        // CASE 3: sale_reduction_return
        //   - Reduce the sale's grand_total
        //   - Reduce the matching sale_items row (qty + total)
        //   - Add the returned quantity BACK to a user-selected stock
        //   - Insert returns record
        // ────────────────────────────────────────────────────────────────────
        if (return_type === "sale_reduction_return") {
            if (!isPositive(sale_id) || !sale_product_name || !isPositive(sale_quantity) || !isPositive(sale_per_unit_amount)) {
                return NextResponse.json(
                    { success: false, message: "sale_id, sale_product_name, sale_quantity, and sale_per_unit_amount are required for Sale Reduction Return." },
                    { status: 400 }
                );
            }
            if (!isPositive(product_id)) {
                return NextResponse.json(
                    { success: false, message: "A stock item must be selected to credit back for Sale Reduction Return." },
                    { status: 400 }
                );
            }

            const result = await db.transaction(async (tx) => {
                // Fetch the sale (sale and line rows are locked until commit so concurrent returns can't over-return)
                const [currentSale] = await tx
                    .select()
                    .from(sales)
                    .where(eq(sales.sale_id, Number(sale_id)))
                    .for("update");

                if (!currentSale) throw new Error(`Sale ID ${sale_id} not found.`);

                // Fetch the matching sale line item
                const [saleItem] = await tx
                    .select()
                    .from(sale_items)
                    .where(eq(sale_items.sale_id, Number(sale_id)))
                    .for("update")
                    .then((rows) => rows.filter((r) => r.product_name === sale_product_name));

                if (!saleItem) throw new Error(`No sale item matching "${sale_product_name}" found in Sale #${sale_id}.`);

                const returnQty = Number(sale_quantity);
                const existingQty = Number(saleItem.quantity);
                if (returnQty > existingQty) {
                    throw new Error(`Cannot return ${returnQty} units — only ${existingQty} were sold in this transaction.`);
                }

                const returnLineTotal = roundMoney(returnQty * Number(sale_per_unit_amount));
                if (returnLineTotal > Number(saleItem.total)) {
                    throw new Error(`Return amount Rs. ${returnLineTotal.toFixed(2)} exceeds the Rs. ${Number(saleItem.total).toFixed(2)} remaining for "${sale_product_name}" in Sale #${sale_id}.`);
                }

                const newSaleItemQty = Math.max(0, existingQty - returnQty);
                const newSaleItemTotal = Math.max(0, parseFloat((Number(saleItem.total) - returnLineTotal).toFixed(2)));
                const newGrandTotal = Math.max(0, parseFloat((Number(currentSale.grand_total) - returnLineTotal).toFixed(2)));

                // Reduce sale_items quantity and total
                await tx
                    .update(sale_items)
                    .set({
                        quantity: newSaleItemQty,
                        total: newSaleItemTotal,
                    })
                    .where(eq(sale_items.sale_detail_id, saleItem.sale_detail_id));

                // Reduce sales grand_total
                await tx
                    .update(sales)
                    .set({ grand_total: newGrandTotal })
                    .where(eq(sales.sale_id, Number(sale_id)));

                // Add returned qty BACK to the selected stock and log it in the stock ledger
                const [creditProduct] = await tx
                    .select()
                    .from(products)
                    .where(eq(products.product_id, Number(product_id)));

                const noStockRow = `No stock record found for product ID ${product_id}.`;
                if (!creditProduct) throw new Error(noStockRow);

                const movement = await applyStockMovement(tx, {
                    productId: creditProduct.product_id,
                    productName: creditProduct.product_name,
                    movementType: "sale_return",
                    quantity: returnQty,
                    movementDate: parsedDate,
                    reference: `Sale #${sale_id}`,
                    note: creditProduct.product_name === sale_product_name ? null : `Returned as "${sale_product_name}"`,
                    requireStockRow: true,
                    messages: { noStockRow },
                });

                // Insert return record
                await tx.insert(returns).values({
                    return_type: "sale_reduction_return",
                    product_name: sale_product_name,
                    quantity: returnQty,
                    per_unit_amount: Number(sale_per_unit_amount),
                    total: returnLineTotal,
                    stock_id: movement.stockId,
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
            if (!isPositive(sale_id) || !sale_product_name || !isPositive(sale_quantity) || !isPositive(sale_per_unit_amount) || !isPositive(expense_per_unit_amount)) {
                return NextResponse.json(
                    { success: false, message: "sale_id, sale_product_name, sale_quantity, sale_per_unit_amount, and expense_per_unit_amount are required for Sale Reduction Expense Return." },
                    { status: 400 }
                );
            }

            const result = await db.transaction(async (tx) => {
                // Fetch the sale (sale and line rows are locked until commit so concurrent returns can't over-return)
                const [currentSale] = await tx
                    .select()
                    .from(sales)
                    .where(eq(sales.sale_id, Number(sale_id)))
                    .for("update");

                if (!currentSale) throw new Error(`Sale ID ${sale_id} not found.`);

                // Fetch the matching sale line item
                const [saleItem] = await tx
                    .select()
                    .from(sale_items)
                    .where(eq(sale_items.sale_id, Number(sale_id)))
                    .for("update")
                    .then((rows) => rows.filter((r) => r.product_name === sale_product_name));

                if (!saleItem) throw new Error(`No sale item matching "${sale_product_name}" found in Sale #${sale_id}.`);

                const returnQty = Number(sale_quantity);
                const existingQty = Number(saleItem.quantity);
                if (returnQty > existingQty) {
                    throw new Error(`Cannot return ${returnQty} units — only ${existingQty} were sold in this transaction.`);
                }

                const returnLineTotal = roundMoney(returnQty * Number(sale_per_unit_amount));
                if (returnLineTotal > Number(saleItem.total)) {
                    throw new Error(`Return amount Rs. ${returnLineTotal.toFixed(2)} exceeds the Rs. ${Number(saleItem.total).toFixed(2)} remaining for "${sale_product_name}" in Sale #${sale_id}.`);
                }

                const calculatedExpenseTotal = roundMoney(returnQty * Number(expense_per_unit_amount));

                const newSaleItemQty = Math.max(0, existingQty - returnQty);
                const newSaleItemTotal = Math.max(0, parseFloat((Number(saleItem.total) - returnLineTotal).toFixed(2)));
                const newGrandTotal = Math.max(0, parseFloat((Number(currentSale.grand_total) - returnLineTotal).toFixed(2)));

                // Reduce sale_items quantity and total
                await tx
                    .update(sale_items)
                    .set({
                        quantity: newSaleItemQty,
                        total: newSaleItemTotal,
                    })
                    .where(eq(sale_items.sale_detail_id, saleItem.sale_detail_id));

                // Reduce sales grand_total
                await tx
                    .update(sales)
                    .set({ grand_total: newGrandTotal })
                    .where(eq(sales.sale_id, Number(sale_id)));

                // Record expense — goods written off using the custom expense rate
                const [expenseResult] = await tx.insert(expenses).values({
                    expense_name: `Sale Reduction Expense Return: ${sale_product_name}`,
                    quantity: returnQty,
                    per_expense_amount: Number(expense_per_unit_amount),
                    total: Number(calculatedExpenseTotal),
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
        console.error("Failed to process return:", error);
        const { message, status } = toErrorResponse(error);
        return NextResponse.json(
            { success: false, message },
            { status }
        );
    }
}
