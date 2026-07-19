import { NextResponse } from "next/server";
import { db } from "@/app/db";
import { expenses, stocks } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { product_id, product_name, quantity, per_expense_amount, total, expense_date } = body;

        // --- Validation ---
        if (!product_id || !product_name || !quantity || quantity <= 0 || per_expense_amount <= 0 || !expense_date) {
            return NextResponse.json(
                { success: false, message: "All fields are required and must be positive values." },
                { status: 400 }
            );
        }

        const parsedDate = new Date(expense_date);

        const result = await db.transaction(async (tx) => {
            // 1. Fetch current stock to validate we have enough
            const [currentStock] = await tx
                .select()
                .from(stocks)
                .where(eq(stocks.product_id, Number(product_id)));

            if (!currentStock) {
                throw new Error(`No stock record found for product ID ${product_id}.`);
            }

            const currentQty = Number(currentStock.quantity);
            if (currentQty < Number(quantity)) {
                throw new Error(
                    `Insufficient stock. Current quantity is ${currentQty}, but you are trying to return ${quantity}.`
                );
            }

            // 2. Deduct quantity from stock
            await tx
                .update(stocks)
                .set({ quantity: sql`${stocks.quantity} - ${Number(quantity)}` })
                .where(eq(stocks.product_id, Number(product_id)));

            // 3. Insert an expense entry for this return
            const [expenseResult] = await tx.insert(expenses).values({
                expense_name: `Return: ${product_name}`,
                quantity: Number(quantity),
                per_expense_amount: Number(per_expense_amount),
                total: Number(total),
                expense_date: parsedDate,
            });

            return { expense_item_id: expenseResult.insertId };
        });

        return NextResponse.json(
            { success: true, message: "Return item processed successfully.", expense_item_id: result.expense_item_id },
            { status: 201 }
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to process return item:", errorMessage);

        // Surface stock-related validation errors clearly to the frontend
        return NextResponse.json(
            { success: false, message: errorMessage },
            { status: 400 }
        );
    }
}
